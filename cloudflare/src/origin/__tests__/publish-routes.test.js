import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { publishShareRouter } from '../publish-routes.js';

vi.mock('../dm-analytics.js', () => ({
  HEADER_ANALYTICS_CONTEXT: 'x-analytics-context',
  handleTemplateDownloadAnalytics: vi.fn(),
}));

const env = {
  AEM_ENV_ID: 'p111-e222',
  PUBLISH_API_USER: { get: vi.fn(() => 'user:pass') },
};

function makeRequest(pathname, method = 'GET') {
  const request = new Request(`https://assets.coke.com${pathname}`, { method });
  request.user = { email: 'test@coke.com' };
  request.cookies = {};
  return request;
}

describe('publishShareRouter – search redirects', () => {
  it('should redirect template-search.html → /en/search/templates', async () => {
    const request = makeRequest(
      '/content/share/us/en/local-customization/template-search.html?fulltext=australia',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/search/templates');
    expect(location.searchParams.get('query')).toBe('australia');
  });

  it('should redirect search-product-assets.html → /en/search/products', async () => {
    const request = makeRequest(
      '/content/share/us/en/products/search-product-assets.html?fulltext=Screentime',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/search/products');
    expect(location.searchParams.get('query')).toBe('Screentime');
  });

  it('should redirect search-assets.html → /en/search/assets', async () => {
    const request = makeRequest(
      '/content/share/us/en/search-assets.html?fulltext=%23E2EOccasionMeals',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/search/assets');
    expect(location.searchParams.get('query')).toBe('#E2EOccasionMeals');
  });

  it('should redirect search-digital-twins.html → /en/search/digital-twin', async () => {
    const request = makeRequest(
      '/content/share/us/en/search-digital-twins.html?fulltext=bottle',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/search/digital-twin');
    expect(location.searchParams.get('query')).toBe('bottle');
  });

  it('should redirect search-assets-pacs.html → /en/search/search-assets-pacs', async () => {
    const request = makeRequest(
      '/content/share/us/en/search-assets-pacs.html?fulltext=agriculture',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/search/search-assets-pacs');
    expect(location.searchParams.get('query')).toBe('agriculture');
  });

  it('should redirect search-assets-mycoke.html → /en/search/search-assets-mycoke', async () => {
    const request = makeRequest(
      '/content/share/us/en/search-assets-mycoke.html?fulltext=myCokeTest',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/search/search-assets-mycoke');
    expect(location.searchParams.get('query')).toBe('myCokeTest');
  });

  it('should respect Japanese locale (jp/ja)', async () => {
    const request = makeRequest(
      '/content/share/jp/ja/search-assets.html?fulltext=test',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/ja/search/assets');
  });

  it('should redirect template-search.html without subfolder', async () => {
    const request = makeRequest(
      '/content/share/jp/ja/template-search.html?fulltext=banner',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/ja/search/templates');
    expect(location.searchParams.get('query')).toBe('banner');
  });
});

describe('publishShareRouter – asset detail view redirect', () => {
  it('should redirect /view/* to asset-details with extracted UUID', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response(
      '<div class="cmp-details-metadata"><h4>ID</h4><p>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</p></div>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    )));
    const request = makeRequest(
      '/content/share/us/en/search-assets/details/image.html/view/marketing/photo.jpg',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/asset-details');
    expect(location.searchParams.get('assetid')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('should redirect to /404 when UUID cannot be extracted', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response(
      '<html><body>No UUID here</body></html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    )));
    const request = makeRequest(
      '/content/share/us/en/search-assets/details/image.html/view/marketing/photo.jpg',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toContain('/404');
  });

  it('should redirect to /400 when AEM returns error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('', { status: 500 })));
    const request = makeRequest(
      '/content/share/us/en/search-assets/details/image.html/view/marketing/photo.jpg',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toContain('/400');
  });

  it('should redirect Sling-suffix detail URLs (/:type.html/*) via handleAssetDetailsRedirect', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response(
      '<div class="cmp-details-metadata"><h4>ID</h4><p>11111111-2222-3333-4444-555555555555</p></div>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    )));
    const request = makeRequest(
      '/content/share/us/en/search-assets/details/document.html/content/dam/tccc/marketing/coca-cola/none/none/2022/03/tccc-word-template-3-22.docx',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/asset-details');
    expect(location.searchParams.get('assetid')).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('should redirect view-user Sling-suffix URLs via handleAssetDetailsRedirect', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response(
      '<div class="cmp-details-metadata"><h4>ID</h4><p>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</p></div>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    )));
    const request = makeRequest(
      '/content/share/us/en/search-assets/details/image.html/view-user/someone@coke.com/photo.jpg',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/en/asset-details');
    expect(location.searchParams.get('assetid')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });
});

describe('publishShareRouter – page redirect', () => {
  it('should redirect single-segment .html pages to EDS equivalent', async () => {
    const request = makeRequest('/content/share/us/en/all-content-stores.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname).toBe('/en/all-content-stores');
  });

  it('should redirect and lowercase all-content-stores child paths', async () => {
    const request = makeRequest('/content/share/us/en/all-content-stores/SchweppesGlobalMixed2025.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname).toBe('/en/all-content-stores/schweppesglobalmixed2025');
  });

  it('should lowercase bottler-content-stores child paths', async () => {
    const request = makeRequest('/content/share/us/en/bottler-content-stores/Coca-Cola-Orange-Cream-Soda.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname)
      .toBe('/en/bottler-content-stores/coca-cola-orange-cream-soda');
  });

  it('should lowercase deeply nested bottler-content-stores child paths', async () => {
    const request = makeRequest('/content/share/jp/ja/bottler-content-stores/Studio-X-Shopper/General-Japan.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname)
      .toBe('/ja/bottler-content-stores/studio-x-shopper/general-japan');
  });

  it('should lowercase ou-portals child paths', async () => {
    const request = makeRequest('/content/share/us/en/ou-portals/Europe-OU-Portal.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname)
      .toBe('/en/ou-portals/europe-ou-portal');
  });

  it('should redirect locale root .html to /{lang}/', async () => {
    const request = makeRequest('/content/share/jp/ja.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname).toBe('/ja/');
  });

  it('should redirect us/en locale root .html to /en/', async () => {
    const request = makeRequest('/content/share/us/en.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname).toBe('/en/');
  });

  it('should extract locale dynamically for page redirects', async () => {
    const request = makeRequest('/content/share/jp/ja/bottler-content-stores/abarta.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname).toBe('/ja/bottler-content-stores/abarta');
  });
});

describe('publishShareRouter – deny HTML (Sling suffixes)', () => {
  it('should redirect Sling-suffix HTML pages to /404', async () => {
    const request = makeRequest(
      '/content/share/us/en/some-page.html/jcr:content/root/container',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toContain('/404');
  });
});

describe('publishShareRouter – allowed HTML (iframes)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('ok')));
  });

  it('should proxy Chili template detail page', async () => {
    const request = makeRequest('/content/share/us/en/search-assets/details/template.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });

  it('should proxy print-job action partials', async () => {
    const request = makeRequest('/content/share/us/en/search-assets/action/print-job-cart.partial.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });

  it('should proxy print-job listing page', async () => {
    const request = makeRequest('/content/share/us/en/search-assets/actions/print-job-listing.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });

  it('should proxy Chili template adapt page', async () => {
    const request = makeRequest(
      '/content/share/us/en/search-assets/details/template/adapt.html/content/dam/tccc-user/test',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });

  it('should redirect print jobs to /en/my-dam/my-print-jobs', async () => {
    const request = makeRequest('/content/share/us/en/my-dam/my-printjobs.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname).toBe('/en/my-dam/my-print-jobs');
  });

  it('should proxy print jobs when loaded in iframe (?inject=)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('ok')));
    const request = makeRequest('/content/share/us/en/my-dam/my-printjobs.html?inject=/blocks/my-print-jobs/my-print-jobs-aem.js');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });

  it('should redirect my-collection to /en/my-dam/my-collections', async () => {
    const request = makeRequest('/content/share/us/en/my-dam/my-collection.html');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')).pathname).toBe('/en/my-dam/my-collections');
  });

  it('should proxy print jobs page with subpath', async () => {
    const request = makeRequest('/content/share/us/en/my-dam/my-printjobs.html/some/subpath');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });
});

describe('publishShareRouter – non-HTML passthrough', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('ok')));
  });

  it('should proxy JSON selector requests', async () => {
    const request = makeRequest('/content/share/us/en/search-assets.updatecollection.json');
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });

  it('should proxy ZIP download requests', async () => {
    const request = makeRequest(
      '/content/share/us/en/search-assets/details/image.tccc-download-asset-renditions.zip',
    );
    const response = await publishShareRouter.fetch(request, env, {});

    expect(response.status).not.toBe(301);
  });
});
