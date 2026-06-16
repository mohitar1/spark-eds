function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function createFadelToken(request, env) {
  const user = await env.FADEL_USER.get();
  const password = await env.FADEL_PASSWORD.get();

  const response = await fetch(`${env.FADEL_ORIGIN}/rc-api/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': request.headers.get('user-agent'),
    },
    body: JSON.stringify({ authRequestToken: utf8ToBase64(`${user}:${password}`) }),
  });

  if (response.ok) {
    const data = await response.json();
    if (data.accessToken && data.expiryDate) {
      return data;
    } else {
      throw new Error(`Failed to generate Fadel token: ${JSON.stringify(data)}`);
    }
  } else {
    throw new Error(`Failed to generate Fadel token: ${response.status} ${response.statusText} ${await response.text()}`);
  }
}

async function getFadelToken(request, env) {
  const fadelUser = await env.FADEL_USER.get();
  const cachedTokenName = `fadel-token-${fadelUser}`;

  // get cached token
  const { value: token, metadata } = await env.AUTH_TOKENS.getWithMetadata(cachedTokenName);

  // use token until 5 minutes before expiry
  if (token && metadata?.expiryDate > (Date.now() + 5*60*1000)) {
    return token;
  } else {
    const tokenData = await createFadelToken(request, env);

    // cache token in KV store
    await env.AUTH_TOKENS.put(cachedTokenName, tokenData.accessToken, {
      expiration: tokenData.expiryDate / 1000,
      metadata: {
        expiryDate: tokenData.expiryDate
      }
    });

    return tokenData.accessToken;
  }
}

export async function originFadel(request, env) {
  const url = new URL(request.url);

  const origin = env.FADEL_ORIGIN;
  const protocolAndHost = origin.split('://');
  url.port = '';
  url.protocol = protocolAndHost[0];
  url.host = protocolAndHost[1];

  // remove /api/fadel from path
  url.pathname = url.pathname.replace(/^\/api\/fadel/, '');

  const req = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  req.headers.delete('cookie');

  try {
    req.headers.set('authorization', await getFadelToken(request, env));
  } catch (error) {
    console.error(error);
    return new Response('Unauthorized', { status: 401 });
  }
  req.headers.set('user-agent', req.headers.get('user-agent'));
  req.headers.set('x-forwarded-host', req.headers.get('host'));

  // console.log('>>>', req.method, req.url, req.headers);

  const resp = await fetch(req, {
    method: req.method
  });

  // console.log('<<<', resp.status, resp.headers);

  // Add X-Fadel-Env so the client can namespace localStorage cache per Fadel environment
  const fadelEnv = deriveFadelEnvFromOrigin(origin);
  const newHeaders = new Headers(resp.headers);
  newHeaders.set('X-Fadel-Env', fadelEnv);

  // TTL for client-side rights cache (seconds); from wrangler.toml FADEL_RIGHTS_CACHE_TTL_SECONDS
  const cacheTtlSeconds = env.FADEL_RIGHTS_CACHE_TTL_SECONDS || '2592000'; // 30 days default
  newHeaders.set('X-Fadel-Rights-Cache-Max-Age', String(cacheTtlSeconds));

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: newHeaders,
  });
}

/**
 * Derive a short env label from FADEL_ORIGIN for cache namespacing (e.g. test vs global).
 * @param {string} origin - e.g. https://test.fadelarc.net or https://global.fadelarc.net
 * @returns {string} 'test' or 'global' (or hostname segment)
 */
function deriveFadelEnvFromOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host.includes('test')) return 'test';
    if (host.includes('global')) return 'global';
    // Use first subdomain or 'global' as default
    const parts = host.split('.');
    return parts.length > 2 ? parts[0] : 'global';
  } catch {
    return 'global';
  }
}
