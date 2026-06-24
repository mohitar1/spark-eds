import { json } from 'itty-router';
import { fetchHelixSheet } from './util/helixutil.js';

export const ROLE = {
  ADMIN: 'admin',
};

/**
 * User types for asset access control.
 * These values are also used as asset metadata tag values on Content Hub assets:
 *   custom:userType = 'internal' | 'external' | 'all'
 */
export const USER_TYPE = {
  INTERNAL: 'internal',
  EXTERNAL: 'external',
  ALL: 'all', // asset sentinel — visible to both internal and external users
};

/**
 * Adobe employee domains that are treated as internal users.
 * Contractors and vendors on non-Adobe domains can be promoted to internal
 * via the /config/access/users override sheet.
 */
const INTERNAL_DOMAINS = new Set(['adobe.com']);

function getEmailDomain(email) {
  return email.split('@').pop().toLowerCase();
}

function pushUnique(array, items) {
  items = Array.isArray(items) ? items : [items];
  array.push(...items.filter((item) => !array.includes(item)));
}

/**
 * Resolve user type (internal vs external) from domain, with per-email/domain
 * override support via the /config/access/users sheet.
 *
 * Internal: Adobe employees (adobe.com domain), or any email/domain explicitly
 * marked as 'internal' in the users sheet.
 * External: everyone else (agency partners, distributors, vendors, etc.).
 *
 * @param {string} domain - User's email domain (lowercase)
 * @param {Object|undefined} userOverride - Row from /config/access/users for this email/domain
 * @returns {string} USER_TYPE.INTERNAL or USER_TYPE.EXTERNAL
 */
function resolveUserType(domain, userOverride) {
  // Explicit override takes precedence (allows promoting external users to internal for demos)
  if (userOverride?.userType === USER_TYPE.INTERNAL) return USER_TYPE.INTERNAL;
  if (userOverride?.userType === USER_TYPE.EXTERNAL) return USER_TYPE.EXTERNAL;
  // Domain-based classification
  return INTERNAL_DOMAINS.has(domain) ? USER_TYPE.INTERNAL : USER_TYPE.EXTERNAL;
}

async function getUserAttributes(request, env, user) {
  const email = user.email;
  const domain = user.domain;

  const attributes = {
    roles: [],
    userType: null,
    countries: [],
  };

  const userArrays = ['roles', 'countries'];
  const users = await fetchHelixSheet(request, env, '/config/access/users', {
    params: {
      limit: 50000,
    },
    mergeSheets: {
      key: 'email',
      arrays: userArrays,
      merge: (existing, incoming) => {
        userArrays.forEach((f) => {
          pushUnique(existing[f], incoming[f]);
        });
        // userType: first non-empty value wins
        if (!existing.userType && incoming.userType) existing.userType = incoming.userType;
        return existing;
      },
    },
  });

  // email match takes precedence over domain match
  const userOverride = users?.[email] || users?.[domain];
  if (userOverride) {
    pushUnique(attributes.roles, userOverride.roles);
    pushUnique(attributes.countries, userOverride.countries);
  }

  attributes.userType = resolveUserType(domain, userOverride);

  return attributes;
}

async function handleSudo(request, env, user) {
  if (['SUDO_NAME', 'SUDO_EMAIL', 'SUDO_COUNTRY', 'SUDO_EMPLOYEE_TYPE'].some((c) => request.cookies[c])) {
    if (!user.permissions.includes('sudo')) {
      console.warn('Sudo denied for user:', user.email);
      return user;
    }

    user.su = {
      name: user.name,
      email: user.email,
      country: user.country,
      employeeType: user.employeeType,
    };

    user.name = request.cookies.SUDO_NAME || user.name;
    user.email = request.cookies.SUDO_EMAIL || user.email;
    user.country = request.cookies.SUDO_COUNTRY || user.country;
    user.employeeType = request.cookies.SUDO_EMPLOYEE_TYPE || user.employeeType;

    const sudoDomain = getEmailDomain(user.email);
    const attributes = await getUserAttributes(request, env, {
      email: user.email,
      domain: sudoDomain,
      country: user.country,
      employeeType: user.employeeType,
    });
    user = { ...user, domain: sudoDomain, ...attributes };
  }

  return user;
}

/**
 * Create the user session cookie payload.
 * Called upon login (OIDC callback).
 */
export async function createSession(request, env) {
  const idToken = request.idToken;
  if (!idToken && !idToken.email) {
    return null;
  }

  const email = idToken.email?.toLowerCase();
  const domain = getEmailDomain(email);

  const access = await fetchHelixSheet(request, env, '/config/access/application', {
    sheet: { key: 'email', arrays: ['permissions'] },
  });

  const permissions = [
    ...(access?.['*']?.permissions || []),
    ...(access?.[domain]?.permissions || []),
    ...(access?.[email]?.permissions || []),
  ];

  const host = request.headers.get('host') || '';
  const liveHosts = ['localhost', 'spark-eds.adobe.workers.dev'];
  const isNonLiveHost = !liveHosts.some((h) => host === h || host.startsWith(`${h}:`));
  if (isNonLiveHost) {
    if (!permissions.includes('preview')) {
      console.warn('User has no permission to access preview environments:', email);
      return false;
    }
  }

  const attributes = await getUserAttributes(request, env, {
    email,
    domain,
    country: idToken.ctry,
    employeeType: idToken.EmployeeType,
  });

  const session = {
    sub: idToken.oid,
    name: idToken.name,
    email,
    domain,
    country: idToken.ctry,
    employeeType: idToken.EmployeeType,
    userId: idToken['User ID'],
    company: idToken.Company,
    title: idToken.Title,
    permissions,
    ...attributes,
  };

  console.warn('New Session cookie:', session);

  return session;
}

/**
 * Get the user object from the session cookie payload.
 * Called upon every request after validating the session cookie.
 */
export async function getUser(request, env, session) {
  return handleSudo(request, env, session);
}

/**
 * Request handler returning the user information as JSON API for the frontend.
 */
export async function apiUser(request, env) {
  const user = {
    ...request.user,
    sessionExpiresInSec: request.user.exp && Math.floor((request.user.exp * 1000 - Date.now()) / 1000),
    aemLoginUrl: env.AEM_ENV_ID ? `https://publish-${env.AEM_ENV_ID}.adobeaemcloud.com/content/share/us/en.html` : '',
  };

  delete user.sub;
  delete user.sid;
  delete user.iss;
  delete user.aud;
  delete user.exp;
  delete user.nbf;

  return json(user);
}
