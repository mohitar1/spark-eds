import { json } from 'itty-router';
import { fetchHelixSheet } from './util/helixutil.js';

export const ROLE = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  CONTINGENT_WORKER: 'contingent-worker',
  AGENCY: 'agency',
  BOTTLER: 'bottler',
};

function getEmailDomain(email) {
  return email.split('@').pop().toLowerCase();
}

function pushUnique(array, items) {
  items = Array.isArray(items) ? items : [items];
  array.push(...items.filter(item => !array.includes(item)));
}

/**
 * @param {Request|null} request - Cloudflare request object
 * @param {Object} env - Cloudflare environment bindings
 */
export async function getRestrictedBrands(request, env) {
  const index = await fetchHelixSheet(request, env, '/config/access/restricted-brands-index.json', { params: { limit: 1000 } });
  const restrictedBrands = {};
  for (const entry of index?.data || []) {
    const path = entry.path;
    if (!path?.endsWith('.json')) continue;
    // get filename without json == brand name
    const brand = path.split('/').pop().replace('.json', '');
    if (brand) restrictedBrands[brand] = path;
  }
  return restrictedBrands;
}

async function getUserAttributes(request, env, user) {
  const email = user.email;
  const domain = user.domain;

  const attributes = {
    roles: [],
    countries: [],
    customers: [],
    brands: [],
  };

  // detailed user attributes / permissions

  const companies = await fetchHelixSheet(request, env, '/config/access/companies', {
    params: {
      limit: 2000,
    },
    sheets: {
      customer: { key: 'domain' },
      bottler:  { key: 'domain', arrays: ['countries'] },
      agency:   { key: 'domain' },
      employee: { key: 'domain' },
      'contingent-worker': { key: 'domain' },
    }
  });

  if (companies) {
    if (companies.customer[domain]) {
      pushUnique(attributes.customers, companies.customer[domain].name);
    }

    if (companies.bottler[domain]) {
      pushUnique(attributes.roles, ROLE.BOTTLER);
      pushUnique(attributes.countries, companies.bottler[domain].countries);
    }

    if (companies.agency[domain]) {
      pushUnique(attributes.roles, ROLE.AGENCY);
    }

    if (companies.employee[domain]) {
      if (user.employeeType === companies.employee[domain].employeeType) {
        pushUnique(attributes.roles, ROLE.EMPLOYEE);
      }
    }

    if (companies['contingent-worker'][domain]) {
      if (user.employeeType === companies['contingent-worker'][domain].employeeType) {
        pushUnique(attributes.roles, ROLE.CONTINGENT_WORKER);
      }
    }
  }

  const userArrays = ['roles', 'countries', 'customers'];
  const users = await fetchHelixSheet(request, env, '/config/access/users', {
    params: {
      limit: 50000,
    },
    mergeSheets: {
      key: 'email',
      arrays: userArrays,
      merge: (existing, incoming) => {
        userArrays.forEach((f) => { pushUnique(existing[f], incoming[f]); });
        return existing;
      },
    },
  });

  const userOverride = users?.[email];
  if (userOverride) {
    pushUnique(attributes.roles, userOverride.roles);
    pushUnique(attributes.countries, userOverride.countries);
    pushUnique(attributes.customers, userOverride.customers);
  }

  // use country from IDP if not configured in EDS sheets
  if (attributes.roles.includes(ROLE.BOTTLER) && attributes.countries.length === 0 && user.country) {
    attributes.countries.push(user.country);
  }

  // make all country codes lowercase
  attributes.countries = attributes.countries.map(c => c.toLowerCase());

  const restrictedBrands = await getRestrictedBrands(request, env);
  for (const brand in restrictedBrands) {
    const path = restrictedBrands[brand];
    const brandSheet = await fetchHelixSheet(request, env, path, {
      sheets: {
        users:     { key: 'email' },
        countries: { key: 'country' },
        roles:     { key: 'role' },
      },
      params: {
        limit: 50000
      }
    });

    if (!brandSheet?.users) continue;
    if (brandSheet.users[email] || brandSheet.users[domain] || brandSheet.users['*']) {
      pushUnique(attributes.brands, brand);
    }
    for (const country of attributes.countries) {
      if (brandSheet.countries[country]) {
        pushUnique(attributes.brands, brand);
      }
    }
    for (const role of attributes.roles) {
      if (brandSheet.roles[role]) {
        pushUnique(attributes.brands, brand);
      }
    }
  }

  return attributes;
}

async function handleSudo(request, env, user) {
  // check for any sudo request
  if (['SUDO_NAME',
       'SUDO_EMAIL',
       'SUDO_COUNTRY',
       'SUDO_EMPLOYEE_TYPE',
       ].some(c => request.cookies[c])) {

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
      employeeType: user.employeeType,
    };

    user.name = request.cookies.SUDO_NAME || user.name;
    user.email = request.cookies.SUDO_EMAIL || user.email;
    user.country = request.cookies.SUDO_COUNTRY || user.country;
    user.employeeType = request.cookies.SUDO_EMPLOYEE_TYPE || user.employeeType;

    const attributes = await getUserAttributes(request, env, {
      email: user.email,
      domain: getEmailDomain(user.email),
      country: user.country,
      employeeType: user.employeeType,
    });
    user = {
      ...user,
      ...attributes,
    };

    // console.log('User session after sudo:', JSON.stringify(user, null, 2));
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

  const email = idToken.email?.toLowerCase();
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
  const liveHosts = [
    'localhost',
    'assets.coke.com',
    'pilot.assets.coke.com',
    'koassets.adobecocacola.workers.dev',
  ];
  const isNonLiveHost = !liveHosts.some((h) => host === h || host.startsWith(`${h}:`));
  if (isNonLiveHost) {
    if (!permissions.includes('preview')) {
      console.warn('User has no permission to access preview environments:', email);
      return false;
    }
  }

  // build user attributes used for authorization
  const attributes = await getUserAttributes(request, env, {
    email,
    domain,
    country: idToken.ctry,
    employeeType: idToken.EmployeeType,
  });

  const session = {
    // user id in MS Entra IDP
    sub: idToken.oid,
    // full name (first + last name)
    name: idToken.name,

    // key IDP attributes (needed for sudo)
    email,
    country: idToken.ctry,
    employeeType: idToken.EmployeeType,

    // informational
    koid: idToken['User ID'],
    company: idToken.Company,
    title: idToken.Title,

    permissions,

    ...attributes,
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
    aemLoginUrl: env.AEM_ENV_ID
      ? `https://publish-${env.AEM_ENV_ID}.adobeaemcloud.com/content/share/us/en.html`
      : '',
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
