import { json } from 'itty-router';
import { fetchHelixSheet } from './util/helixutil.js';

export const ROLE = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
};

function getEmailDomain(email) {
  return email?.split('@')?.pop()?.toLowerCase();
}

async function handleSudo(request, _env, user) {
  // check for any sudo request
  if (['SUDO_NAME', 'SUDO_EMAIL', 'SUDO_COUNTRY'].some((c) => request.cookies[c])) {
    // only certain super users are allowed to sudo
    if (!user.permissions.includes('sudo')) {
      console.warn('Sudo denied for user:', user.email);
      return user;
    }

    // store original super user data
    user.su = {
      name: user.name,
      email: user.email,
      country: user.country,
    };

    user.name = request.cookies.SUDO_NAME || user.name;
    user.email = request.cookies.SUDO_EMAIL || user.email;
    user.country = request.cookies.SUDO_COUNTRY || user.country;
  }

  return user;
}

/**
 * Create the user session cookie payload.
 * Called upon login (OIDC callback).
 *
 * @param {Request} request cloudflare request object
 * @param {Object} env cloudflare environment
 * @returns {Object} session or false if user has no idToken or lacks required permissions
 */
export async function createSession(request, env) {
  const idToken = request.idToken;
  if (!idToken && !idToken.email) {
    return null;
  }

  const email = (idToken.email || idToken.preferred_username)?.toLowerCase();
  const domain = getEmailDomain(email);

  // basic access & permissions
  const access = await fetchHelixSheet(request, env, '/config/access/application', {
    sheet: { key: 'email', arrays: ['permissions'] },
  });

  const permissions = [
    ...(access?.['*']?.permissions || []),
    ...(access?.[domain]?.permissions || []),
    ...(access?.[email]?.permissions || []),
  ];

  // check preview access
  const host = request.headers.get('host') || '';
  const liveHosts = ['localhost', 'assets.example.com'];
  const isNonLiveHost = !liveHosts.some((h) => host === h || host.startsWith(`${h}:`));
  if (isNonLiveHost) {
    if (!permissions.includes('preview')) {
      console.warn('User has no permission to access preview environments:', email);
      return false;
    }
  }

  const session = {
    // user id in MS Entra IDP
    sub: idToken.oid,
    // full name (first + last name)
    name: idToken.name,

    // key IDP attributes (needed for sudo)
    email,
    country: idToken.ctry,

    // informational
    koid: idToken['User ID'],
    title: idToken.Title,

    permissions,
  };

  console.log('New Session cookie:', session);

  return session;
}

/**
 * Get the user object from the session cookie payload.
 * Called upon every request after validating the session cookie.
 *
 * @param {Request} request cloudflare request object
 * @param {Object} env cloudflare environment
 * @param {Object} session session payload from the JWT
 * @returns {Object} user or null/undefined if user is not allowed to access this application
 */
export async function getUser(request, env, session) {
  return handleSudo(request, env, session);
}

/**
 * Request handler returning the user information as json API for the frontend.
 *
 * @param {Request} request cloudflare request object
 * @returns {Response} json http response
 */
export async function apiUser(request, env) {
  const user = {
    ...request.user,
    sessionExpiresInSec: request.user.exp && Math.floor((request.user.exp * 1000 - Date.now()) / 1000),
    aemLoginUrl: env.AEM_ENV_ID ? `https://publish-${env.AEM_ENV_ID}.adobeaemcloud.com/content/share/us/en.html` : '',
  };

  // remove session cookie metadata
  delete user.sub;
  delete user.sid;
  delete user.iss;
  delete user.aud;
  delete user.exp;
  delete user.nbf;

  return json(user);
}
