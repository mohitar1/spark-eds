/**
 * Deny-by-default router for /content/share/* URLs.
 *
 * Uses an itty-router child router so every allowed path is an explicit route.
 * Anything not explicitly allowed that contains .html is redirected to /404.
 *
 * Route order:
 *   1. Redirects   — legacy search & asset-detail URLs → EDS equivalents
 *   2. Allow HTML  — Chili template & print-jobs iframes → AEM Publish proxy
 *   3. Deny HTML   — everything else with .html → /404
 *   4. Allow rest   — JSON selectors, ZIP downloads, etc. → AEM Publish proxy
 */

import { Router } from 'itty-router';
import { originPublish, handleAssetDetailsRedirect } from './publish.js';
import { transformSearchHtmlUrlContentAI } from '../../../shared/content-share-transform.js';

/**
 * Middleware factory: redirect a legacy ACS search URL to the EDS search page,
 * preserving fulltext query and facet/date-range parameters.
 * @param {string} searchType - EDS search type (e.g. 'assets', 'templates')
 */
function withSearchRedirect(searchType) {
  return (request) => {
    const url = new URL(request.url);
    // /content/share/{cc}/{ll}/... → ll is segment [4]
    const lang = url.pathname.split('/')[4] || 'en';
    const searchPath = `/${lang}/search/${searchType}`;
    const transformed = transformSearchHtmlUrlContentAI(
      url.pathname + url.search,
      searchPath,
    );
    const target = transformed || searchPath;
    const [path, search] = target.split('?');
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = path;
    redirectUrl.search = search ? `?${search}` : '';
    return Response.redirect(redirectUrl.href, 301);
  };
}

/**
 * Strips /content/share/{cc}/{ll} prefix and .html suffix,
 * redirecting to the equivalent EDS path under /{ll}/...
 */
const LOWERCASE_PATH_PREFIXES = [
  'all-content-stores/',
  'bottler-content-stores/',
  'ou-portals/',
];

function withPageRedirect(request) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  const langSegment = segments[4] || 'en';
  const lang = langSegment.replace(/\.html$/, '');
  let rest = segments.slice(5).join('/').replace(/\.html$/, '');
  if (LOWERCASE_PATH_PREFIXES.some((p) => rest.startsWith(p))) {
    const firstSlash = rest.indexOf('/');
    rest = rest.slice(0, firstSlash + 1) + rest.slice(firstSlash + 1).toLowerCase();
  }
  const target = rest ? `/${lang}/${rest}` : `/${lang}/`;
  return Response.redirect(new URL(target, request.url).href, 301);
}

function with404Redirect(request) {
  return Response.redirect(new URL('/404', request.url).href, 301);
}

const publishShareRouter = Router();

publishShareRouter

  // ── Redirects: legacy search URLs → EDS search pages ──────────────────
  .get('/content/share/:cc/:ll/local-customization/template-search.html',
    withSearchRedirect('templates'))
  .get('/content/share/:cc/:ll/template-search.html',
    withSearchRedirect('templates'))
  .get('/content/share/:cc/:ll/products/search-product-assets.html',
    withSearchRedirect('products'))
  .get('/content/share/:cc/:ll/search-digital-twins.html',
    withSearchRedirect('digital-twin'))
  .get('/content/share/:cc/:ll/search-assets-pacs.html',
    withSearchRedirect('search-assets-pacs'))
  .get('/content/share/:cc/:ll/search-assets-mycoke.html',
    withSearchRedirect('search-assets-mycoke'))
  .get('/content/share/:cc/:ll/search-assets.html',
    withSearchRedirect('assets'))

  // ── Redirect: asset detail view → EDS asset-details (fetches UUID) ────
  .all('/content/share/:cc/:ll/search-assets/details/:type/view/*',
    handleAssetDetailsRedirect)

  // ── Allow HTML: Chili template pages (iframes) ────────────────────────
  .all('/content/share/:cc/:ll/search-assets/details/template.html',
    originPublish)
  .all('/content/share/:cc/:ll/search-assets/details/template/*',
    originPublish)

  // ── Redirect: asset detail Sling-suffix URLs → EDS asset-details ─────
  .all('/content/share/:cc/:ll/search-assets/details/:type.html/*',
    handleAssetDetailsRedirect)

  // ── Allow HTML: print-job action partials (loaded inside iframes) ───
  .all('/content/share/:cc/:ll/search-assets/actions/*',
    originPublish)
  .all('/content/share/:cc/:ll/search-assets/action/*',
    originPublish)

  // ── Redirects: My DAM pages where AEM name differs from EDS name ────
  .get('/content/share/:cc/:ll/my-dam/my-collection.html', (request) => {
    const lang = new URL(request.url).pathname.split('/')[4] || 'en';
    return Response.redirect(new URL(`/${lang}/my-dam/my-collections`, request.url).href, 301);
  })

  // ── Print jobs: proxy when ?inject= or when filter params (iframe navigation); redirect otherwise to avoid nested iframe
  .all('/content/share/:cc/:ll/my-dam/my-printjobs.html', (request, env, ctx) => {
    const url = new URL(request.url);
    if (url.searchParams.has('inject')) return originPublish(request, env, ctx);
    const hasFilterParams = [...url.searchParams.keys()].some((k) => k.includes('_group.propertyvalues'));
    if (hasFilterParams) {
      return originPublish(request, env, ctx, {
        ensureInject: '/blocks/my-print-jobs/my-print-jobs-injection.js',
      });
    }
    //Adding query params to the redirect url
    const lang = url.pathname.split('/')[4] || 'en';
    const redirectUrl = new URL(`/${lang}/my-dam/my-print-jobs`, url);
    redirectUrl.search = url.search
    return Response.redirect(redirectUrl.href, 301);
  })
 .all('/content/share/:cc/:ll/my-dam/my-printjobs*', originPublish)

  // ── Redirect: any remaining path ending in .html → EDS equivalent ───
  .get('/content/share/*.html', withPageRedirect)

  // ── Deny: Sling-suffix paths (.html in the middle) → 404 ──────────
  .all('/content/share/*.html*', with404Redirect)

  // ── Allow: non-HTML (JSON selectors, ZIP downloads) → AEM Publish ────
  .all('/content/share/*', originPublish);

export {
  publishShareRouter,
  withSearchRedirect,
  withPageRedirect,
  with404Redirect,
};
