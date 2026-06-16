import { HEADER_ANALYTICS_CONTEXT } from './dm-analytics.js';

/**
 * Fetches the AEM asset detail page to extract the UUID,
 * then redirects to the EDS asset-details page.
 * Called by publish-routes.js for /search-assets/details/:type/view/* URLs.
 */
export async function handleAssetDetailsRedirect(request, env) {
  const url = new URL(request.url);
  url.protocol = 'https';
  url.host = `publish-${env.AEM_ENV_ID}.adobeaemcloud.com`;
  url.port = '';

  const headers = new Headers(request.headers);
  headers.delete('origin');
  headers.delete('referer');
  headers.set('user-agent', 'koassets-contenthub');
  headers.set('authorization', `Basic ${btoa(`${await env.PUBLISH_API_USER.get()}`)}`);
  const affinity = request.cookies?.affinity;
  headers.set('cookie', `sling.sudo=${request.user.email}; dmex_login_visited=yes;${affinity ? ` affinity=${affinity};` : ''}`);

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    return Response.redirect(new URL('/400', request.url).href, 301);
  }

  const html = await response.text();

  // Try to extract UUID using two methods:
  // 1. From cmp-details-metadata section with ID header: <h4>ID</h4>...<p>{uuid}</p>
  // 2. From data-asset-share-uuid attribute (fallback)
  const match = html.match(/cmp-details-metadata[\s\S]*?<h4[^>]*>\s*ID\s*<\/h4>[\s\S]*?<p>\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*<\/p>/i)
    || html.match(/data-asset-share-uuid=["']([^"']+)["']/);

  if (match?.[1]) {
    const assetId = match[1];
    // Extract locale from original URL: /content/share/{country}/{locale}/search-assets/...
    const pathSegments = new URL(request.url).pathname.split('/');
    const locale = pathSegments[4] || 'en'; // Default to 'en' if not found
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = `/${locale}/asset-details`;
    redirectUrl.search = `?assetid=${encodeURIComponent(assetId)}`;
    return Response.redirect(redirectUrl.href, 301);
  }

  return Response.redirect(new URL('/404', request.url).href, 301);
}

export async function originPublishPassthrough(request, env) {
  const url = new URL(request.url);
  url.protocol = 'https';
  url.host = `publish-${env.AEM_ENV_ID}.adobeaemcloud.com`;
  url.port = '';

  const headers = new Headers(request.headers);
  headers.delete('cookie');

  const body = request.body ? await request.arrayBuffer() : null;
  const response = await fetch(url, { method: request.method, headers, body });

  if (response.status === 404) {
    return new Response('', { status: 404 });
  }

  return response;
}

/**
 * Bypass for Chili rendering engine requests.
 * Chili templates hardcode assets.coke.com URLs and fetch them with Basic Auth
 * (username "chili-frame-api-user"). These requests can't go through Microsoft Entra
 * auth, so we intercept them early and proxy directly to AEM publish,
 * forwarding the Basic Auth header as-is.
 * Returns undefined (falls through) for non-matching requests.
 */
export async function originPublishChili(request, env) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Basic ')) return undefined;

  let decoded;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return undefined;
  }

  const username = decoded.split(':')[0];
  console.info(`[Chili] Basic Auth request from username: ${username}`);
  const allowed = ['chili-frame-api-user', 'test-chili-proxy-tmp'];
  if (!allowed.includes(username)) return undefined;

  return originPublishPassthrough(request, env);
}

/**
 * Proxy authenticated requests to AEM publish origin (impersonation, inject script, analytics).
 * @param {Request} request
 * @param {object} env
 * @param {object} ctx
 * @param {{ ensureInject?: string }} [options] - If set and URL has no inject param, add it (e.g. print jobs filter in iframe)
 */
export async function originPublish(request, env, ctx, options = {}) {
  // build AEM CS publish URL
  const url = new URL(request.url);
  url.protocol = 'https';
  url.host = `publish-${env.AEM_ENV_ID}.adobeaemcloud.com`;
  url.port = '';

  const headers = new Headers(request.headers);

  // Track template download analytics before proxying.
  // Only fires on the initial submission POST (not polling re-POSTs which
  // carry a templateId query param) when the client attaches the header.
  if (request.method === 'POST'
    && url.pathname.endsWith('.tccc-download-asset-renditions.zip')
    && !url.searchParams.has('templateId')
    && headers.has(HEADER_ANALYTICS_CONTEXT)) {
    const { handleTemplateDownloadAnalytics } = await import('./dm-analytics.js');
    handleTemplateDownloadAnalytics(request, headers, env, ctx);
  }

  // circumvent AEM CSRF + Referrer protection
  headers.delete('origin');
  headers.delete('referer');
  headers.set('user-agent', 'koassets-contenthub');

  // authenticate as same user using AEM impersonation
  headers.set('authorization', `Basic ${btoa(`${await env.PUBLISH_API_USER.get()}`)}`);
  const affinity = request.cookies?.affinity;
  headers.set('cookie', `sling.sudo=${request.user?.email}; dmex_login_visited=yes;${affinity ? ` affinity=${affinity};` : ''}`);

  if (options.ensureInject && !url.searchParams.has('inject')) {
    url.searchParams.set('inject', options.ensureInject);
  }
  // extract inject param before forwarding to origin
  const jsInject = url.searchParams.get('inject');
  url.searchParams.delete('inject');

  // console.info('>>>', request.method, url.href, headers);

  // Buffer the stream body so fetch can retransmit it on redirects
  const body = request.body ? await request.arrayBuffer() : null;
  const response = await fetch(url, {
    method: request.method,
    headers,
    body,
  });

  // console.info('<<<', response.status, response.headers);

  // ensure user never see the basic auth dialog in the browser
  // and show a friendly error message
  // and respond with a clear 401 status code that client code can handle
  if (response.headers.get('WWW-Authenticate')) {
    return new Response('Failed to authenticate to AEM publish. Please contact administrators.', { status: 401 });
  }

  // inject custom javascript into html responses (local paths only!) for manipulating iframes
  const contentType = response.headers.get("content-type");
  if (jsInject?.startsWith("/") && contentType?.includes("text/html")) {
    return new HTMLRewriter()
      .on("head", {
        element(element) {
          element.append(
            `<script type="module" async src="${jsInject}"></script>`,
            { html: true }
          );
        },
      })
      .transform(response);
  }

  // Return clean 404 for HTML responses (avoid leaking AEM error pages)
  if (response.status === 404
    && response.headers.get('content-type')?.includes('text/html')) {
    return new Response('', { status: 404 });
  }

  return response;
}