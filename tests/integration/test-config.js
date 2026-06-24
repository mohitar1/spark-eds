/* eslint-disable import/prefer-default-export */

/**
 * Declarative integration test definitions.
 *
 * Each top-level key is a feature area.  Inside each you can define:
 *   api   – array of API endpoint tests
 *   pages – array of page-load smoke tests
 *
 * Every test has:
 *   name   – human-readable label
 *   method – HTTP method (defaults to GET)
 *   path   – relative URL path
 *   body   – optional JSON body (for POST)
 *   query  – optional query-string params
 *   expect – assertions (status, hasFields, contains, minLength, nested …)
 *   expectByEnv – per-environment overrides merged on top of `expect`
 */

export const testConfig = {
  /* ================================================================ */
  /*  User                                                             */
  /* ================================================================ */
  user: {
    api: [
      {
        name: 'Get current user profile',
        method: 'GET',
        path: '/api/user',
        expect: {
          status: 200,
          hasFields: ['name', 'email', 'permissions', 'roles'],
        },
      },
    ],
  },

  /* ================================================================ */
  /*  Search                                                          */
  /* ================================================================ */
  search: {
    api: [
      {
        name: 'Empty search returns results',
        method: 'POST',
        path: '/api/adobe/assets/contentai/search',
        body: { query: [{ match: { text: '' } }], limit: 10 },
        expect: {
          status: 200,
          hasFields: ['hits', 'cursor', 'search_metadata'],
        },
      },
      {
        name: 'Search by keyword',
        method: 'POST',
        path: '/api/adobe/assets/contentai/search',
        body: { query: [{ match: { text: 'sample asset' } }], limit: 10 },
        expect: {
          status: 200,
          hasFields: ['hits'],
        },
      },
      {
        name: 'Search collections',
        method: 'POST',
        path: '/api/adobe/assets/contentai/collections/search',
        body: {
          query: [{ match: { text: '', fields: ['collectionMetadata.title', 'collectionMetadata.description'] } }],
          limit: 10,
          orderBy: 'repositoryMetadata.repo:modifyDate desc',
        },
        expect: {
          status: 200,
          hasFields: ['hits', 'search_metadata'],
        },
      },
    ],
    pages: [
      {
        name: 'Search page loads',
        path: '/en/search/assets',
        expect: {
          status: 200,
          contentType: 'text/html',
          contains: ['<header', '<main', 'search-results'],
        },
      },
    ],
  },

  /* ================================================================ */
  /*  Analytics / Reporting                                           */
  /* ================================================================ */
  reporting: {
    api: [
      {
        name: 'Report metrics',
        method: 'GET',
        path: '/api/analytics/report-metrics',
        query: { start: '2025-01-01', end: '2025-12-31' },
        expect: {
          status: 200,
          hasFields: ['success', 'metrics', 'charts'],
        },
        expectByEnv: {
          local: { status: [200, 500] }, // local may lack Analytics Engine
        },
      },
      {
        name: 'Raw downloads',
        method: 'GET',
        path: '/api/analytics/raw-downloads',
        query: { start: '2025-01-01', end: '2025-12-31' },
        expect: { status: [200, 500] }, // gracefully handle missing AE
      },
      {
        name: 'User logins CSV',
        method: 'GET',
        path: '/api/user-logins/csv',
        expect: { status: [200, 403, 500] }, // depends on permission + D1
      },
    ],
    pages: [
      {
        name: 'Report hub page',
        path: '/en/reports/report-hub',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'report-hub'] },
      },
      {
        name: 'Downloads report page',
        path: '/en/reports/downloads',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'report-downloads'] },
      },
      {
        name: 'Users report page',
        path: '/en/reports/logins',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'report-logins'] },
      },
      {
        name: 'Search analytics report page',
        path: '/en/reports/searches',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'report-searches'] },
      },
      {
        name: 'Assets report page',
        path: '/en/reports/assets',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'report-assets'] },
      },
    ],
  },

  /* ================================================================ */
  /*  Collections                                                     */
  /* ================================================================ */
  collections: {
    pages: [
      {
        name: 'Search collections page',
        path: '/en/search-collections',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'search-collection-results'] },
      },
      {
        name: 'Collection details page',
        path: '/en/collection-details',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'collection-details'] },
      },
    ],
  },

  /* ================================================================ */
  /*  Rights Requests (user-facing)                                   */
  /* ================================================================ */
  rightsRequests: {
    api: [
      {
        name: 'List my rights requests',
        method: 'GET',
        path: '/api/rightsrequests',
        expect: { status: 200, hasFields: ['success', 'data', 'count'] },
      },
      {
        name: 'List unassigned reviews',
        method: 'GET',
        path: '/api/rightsrequests/reviews',
        query: { tab: 'unassigned' },
        expect: { status: [200, 403] }, // 403 if user lacks manage-rights/admin-rights
      },
      {
        name: 'List assigned reviews',
        method: 'GET',
        path: '/api/rightsrequests/reviews',
        query: { tab: 'assigned' },
        expect: { status: [200, 403] },
      },
      {
        name: 'Reviews missing tab param returns 400',
        method: 'GET',
        path: '/api/rightsrequests/reviews',
        expect: { status: [400, 403] }, // 400 if has permission but no tab; 403 if no permission
      },
      {
        name: 'Single review lookup (nonexistent)',
        method: 'GET',
        path: '/api/rightsrequests/reviews',
        query: { requestId: '00000000000' },
        // 404 if has permission but review not found; 403 if no permission
        expect: { status: [404, 403] },
      },
      {
        name: 'List available reviewers',
        method: 'GET',
        path: '/api/rightsrequests/reviews/reviewers',
        expect: { status: [200, 403] }, // 403 if user lacks admin-rights
      },
    ],
    pages: [
      {
        name: 'My rights requests page',
        path: '/en/my-dam/my-rights-requests',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'my-rights-requests'] },
      },
      {
        name: 'My rights reviews page',
        path: '/en/my-dam/my-rights-reviews',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'my-rights-reviews'] },
      },
    ],
  },

  /* ================================================================ */
  /*  Rights Request Report (admin)                                   */
  /* ================================================================ */
  rightsRequestReport: {
    api: [
      {
        name: 'All rights requests (admin report)',
        method: 'GET',
        path: '/api/rightsrequests/all',
        expect: {
          status: [200, 403], // 403 if user lacks admin-reports permission
        },
        expectByEnv: {
          production: {
            status: 200,
            hasFields: ['success', 'data', 'count', 'hasMore'],
          },
        },
      },
    ],
    pages: [
      {
        name: 'Rights request report page',
        path: '/en/reports/rights-requests',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'report-rights-requests'] },
      },
    ],
  },

  /* ================================================================ */
  /*  Notifications                                                    */
  /* ================================================================ */
  notifications: {
    api: [
      {
        name: 'List notifications',
        method: 'GET',
        path: '/api/messages',
        expect: {
          status: 200,
          hasFields: ['success', 'messages'],
        },
      },
    ],
    pages: [
      {
        name: 'My notifications page',
        path: '/en/my-dam/my-notifications',
        expect: { status: 200, contentType: 'text/html', contains: ['<header', '<main', 'my-notifications'] },
      },
    ],
  },

  /* ================================================================ */
  /*  Fadel (Rights Clearance Proxy)                                   */
  /* ================================================================ */
  fadel: {
    api: [
      {
        name: 'List collections via FADEL proxy',
        method: 'GET',
        path: '/api/fadel/collections',
        expect: { status: [200, 404] },
      },
      {
        name: 'Fetch media rights (type 20)',
        method: 'POST',
        path: '/api/fadel/rc-api/rights/search/20',
        body: { description: '' },
        expect: { status: 200 },
      },
      {
        name: 'Fetch market rights (type 30)',
        method: 'POST',
        path: '/api/fadel/rc-api/rights/search/30',
        body: { description: '' },
        expect: { status: 200 },
      },
      {
        name: 'Check asset clearance',
        method: 'POST',
        path: '/api/fadel/rc-api/clearance/assetclearance',
        body: {
          inDate: Date.now(),
          outDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          selectedExternalAssets: ['00000000-0000-0000-0000-000000000000'],
          selectedRights: { 20: [0], 30: [0] },
        },
        expect: { status: [200, 204] }, // 204 if no matching assets
      },
    ],
  },
};

/* ================================================================== */
/*  Localization – auto-generate /ja/ variants of all /en/ pages       */
/* ================================================================== */
const EN_ONLY_PATHS = ['/en/reports/', '/en/drafts/'];
const jaPages = [];
Object.values(testConfig).forEach((suites) => {
  (suites.pages || []).forEach((spec) => {
    if (spec.path.startsWith('/en/')) {
      const enOnly = EN_ONLY_PATHS.some((prefix) => spec.path.startsWith(prefix));
      if (enOnly) return;
      jaPages.push({
        ...spec,
        name: spec.name.replace(/page$/i, 'page (ja)').replace(/loads$/i, 'loads (ja)'),
        path: spec.path.replace(/^\/en\//, '/ja/'),
      });
    }
  });
});
testConfig.localization = { pages: jaPages };
