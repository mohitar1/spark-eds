import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import {
  handleTemplateDownloadAnalytics,
  extractSearchContext,
  HEADER_ANALYTICS_CONTEXT,
} from '../dm-analytics.js';

vi.mock('../../util/analytics-helper.js', () => ({
  trackAnalyticsEvent: vi.fn(() => Promise.resolve()),
}));

function createMockHeaders(analyticsContext) {
  const headers = new Headers();
  if (analyticsContext) {
    headers.set(HEADER_ANALYTICS_CONTEXT, JSON.stringify(analyticsContext));
  }
  return headers;
}

function createMockRequest(user = {
  koid: 'K123', country: 'US', employeeType: '10', company: 'TCCC', roles: ['employee'],
}) {
  return { user };
}

function createMockCtx() {
  return { waitUntil: vi.fn((p) => p.catch(() => {})) };
}

const validContext = {
  downloadId: 'test-uuid-1234',
  resourceType: 'template',
  assets: [
    {
      assetId: 'asset-001',
      brand: 'coca-cola',
      campaign: 'summer-2026',
      downloadType: 'ready-to-use',
      renditions: ['LowResImageJPG', 'HighResPDF'],
    },
  ],
};

describe('handleTemplateDownloadAnalytics', () => {
  let trackAnalyticsEvent;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../util/analytics-helper.js');
    trackAnalyticsEvent = mod.trackAnalyticsEvent;
  });

  it('returns false when no analytics header is present', () => {
    const headers = new Headers();
    const result = handleTemplateDownloadAnalytics(
      createMockRequest(),
      headers,
      {},
      createMockCtx(),
    );
    expect(result).toBe(false);
  });

  it('parses header and fires tracking via waitUntil', () => {
    const headers = createMockHeaders(validContext);
    const ctx = createMockCtx();
    const result = handleTemplateDownloadAnalytics(
      createMockRequest(),
      headers,
      {},
      ctx,
    );

    expect(result).toBe(true);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it('strips the analytics header after processing', () => {
    const headers = createMockHeaders(validContext);
    handleTemplateDownloadAnalytics(createMockRequest(), headers, {}, createMockCtx());

    expect(headers.has(HEADER_ANALYTICS_CONTEXT)).toBe(false);
  });

  it('strips the header even when parsing fails', () => {
    const headers = new Headers();
    headers.set(HEADER_ANALYTICS_CONTEXT, 'not-valid-json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleTemplateDownloadAnalytics(createMockRequest(), headers, {}, createMockCtx());

    expect(headers.has(HEADER_ANALYTICS_CONTEXT)).toBe(false);
    consoleSpy.mockRestore();
  });

  it('does not fire tracking when downloadId is missing', () => {
    const context = { ...validContext, downloadId: '' };
    const headers = createMockHeaders(context);
    const ctx = createMockCtx();

    handleTemplateDownloadAnalytics(createMockRequest(), headers, {}, ctx);

    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it('does not fire tracking when assets array is empty', () => {
    const context = { ...validContext, assets: [] };
    const headers = createMockHeaders(context);
    const ctx = createMockCtx();

    handleTemplateDownloadAnalytics(createMockRequest(), headers, {}, ctx);

    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it('passes resourceType "template" through to trackArchiveAnalytics', async () => {
    const headers = createMockHeaders(validContext);
    const ctx = createMockCtx();
    const env = {};

    handleTemplateDownloadAnalytics(createMockRequest(), headers, env, ctx);

    // Wait for the fire-and-forget promise
    await ctx.waitUntil.mock.calls[0][0];

    expect(trackAnalyticsEvent).toHaveBeenCalled();
    const { calls } = trackAnalyticsEvent.mock;
    // Each rendition gets a separate event
    expect(calls.length).toBe(2);
    // Both should have resourceType 'template'
    calls.forEach((call) => {
      expect(call[1]).toBe('download');
      expect(call[2].resourceType).toBe('template');
    });
  });

  it('tracks one event per asset+rendition combination', async () => {
    const multiContext = {
      downloadId: 'test-uuid-multi',
      resourceType: 'template',
      assets: [
        {
          assetId: 'a1', brand: 'b1', campaign: 'c1', downloadType: 'ready-to-use', renditions: ['LowResImageJPG'],
        },
        {
          assetId: 'a2', brand: 'b2', campaign: 'c2', downloadType: 'restricted', renditions: ['HighResPDF', 'LowResPDF'],
        },
      ],
    };
    const headers = createMockHeaders(multiContext);
    const ctx = createMockCtx();

    handleTemplateDownloadAnalytics(createMockRequest(), headers, {}, ctx);
    await ctx.waitUntil.mock.calls[0][0];

    // a1 has 1 rendition, a2 has 2 renditions = 3 total events
    expect(trackAnalyticsEvent).toHaveBeenCalledTimes(3);

    const itemIds = trackAnalyticsEvent.mock.calls.map((c) => c[2].downloadItemId);
    expect(itemIds).toContain('a1');
    expect(itemIds.filter((id) => id === 'a2').length).toBe(2);
  });

  it('includes correct user data in tracked events', async () => {
    const user = {
      koid: 'K999', country: 'FR', employeeType: '10', company: 'TCCC', roles: ['bottler'],
    };
    const headers = createMockHeaders({
      ...validContext,
      assets: [{
        assetId: 'a1', brand: 'fanta', campaign: 'winter', downloadType: 'restricted', renditions: ['LowResImageJPG'],
      }],
    });
    const ctx = createMockCtx();

    handleTemplateDownloadAnalytics(createMockRequest(user), headers, {}, ctx);
    await ctx.waitUntil.mock.calls[0][0];

    const eventData = trackAnalyticsEvent.mock.calls[0][2];
    expect(eventData.koid).toBe('K999');
    expect(eventData.country).toBe('FR');
    expect(eventData.company).toBe('TCCC');
    expect(eventData.brand).toBe('fanta');
    expect(eventData.campaigns).toBe('winter');
    expect(eventData.downloadType).toBe('restricted');
    expect(eventData.rendition).toBe('LowResImageJPG');
  });
});

describe('HEADER_ANALYTICS_CONTEXT constant', () => {
  it('exports the correct header name', () => {
    expect(HEADER_ANALYTICS_CONTEXT).toBe('x-analytics-context');
  });
});

// ─── extractSearchContext ────────────────────────────────────────────────────

function makeRequest(referer, body = {}) {
  const headers = new Headers();
  if (referer) headers.set('Referer', referer);
  return { headers, searchContext: undefined, ...body };
}

const contentAIBody = {
  query: [{ match: { text: 'sprite', fields: ['repositoryMetadata.repo:name'] } }],
};

const algoliaBody = {
  requests: [{ params: { query: 'fanta' } }],
};

const assetIdBody = {
  query: [{ and: [{ term: { assetId: ['urn:aaid:aem:f64b204a-586b-48d2-ad18-ec10e11218d4'] } }] }],
};

describe('extractSearchContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sets searchContext with correct type for /search/all referer (ContentAI)', () => {
    const req = makeRequest('https://koassets.adobe.com/search/all?q=sprite');
    extractSearchContext(req, contentAIBody);
    expect(req.searchContext).toEqual({ searchTerm: 'sprite', searchType: 'all' });
  });

  it('sets searchContext with correct type for /search/assets referer (ContentAI)', () => {
    const req = makeRequest('https://koassets.adobe.com/search/assets');
    extractSearchContext(req, contentAIBody);
    expect(req.searchContext).toMatchObject({ searchType: 'assets' });
  });

  it('sets searchContext with correct type for /search/templates referer (ContentAI)', () => {
    const req = makeRequest('https://koassets.adobe.com/search/templates');
    extractSearchContext(req, contentAIBody);
    expect(req.searchContext).toMatchObject({ searchType: 'templates' });
  });

  it('sets searchContext with correct type for /search/products referer (ContentAI)', () => {
    const req = makeRequest('https://koassets.adobe.com/search/products');
    extractSearchContext(req, contentAIBody);
    expect(req.searchContext).toMatchObject({ searchType: 'products' });
  });

  it('sets searchContext for Algolia format with matching referer', () => {
    const req = makeRequest('https://koassets.adobe.com/search/all');
    extractSearchContext(req, algoliaBody);
    expect(req.searchContext).toEqual({ searchTerm: 'fanta', searchType: 'all' });
  });

  it('extracts assetId as searchTerm for term-based ContentAI query', () => {
    const req = makeRequest('https://koassets.adobe.com/search/all');
    extractSearchContext(req, assetIdBody);
    expect(req.searchContext).toEqual({
      searchTerm: 'urn:aaid:aem:f64b204a-586b-48d2-ad18-ec10e11218d4',
      searchType: 'all',
    });
  });

  it('does NOT set searchContext for non-UI referer (asset-details page)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = makeRequest('https://koassets.adobe.com/en/asset-details?assetid=abc');
    extractSearchContext(req, contentAIBody);
    expect(req.searchContext).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Search not from UI — skipping analytics.'),
      expect.stringContaining('user='),
      expect.stringContaining('asset-details'),
      expect.stringContaining('searchTerm='),
      expect.stringContaining('userAgent='),
    );
  });

  it('does NOT set searchContext when Referer is absent', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = makeRequest('');
    extractSearchContext(req, contentAIBody);
    expect(req.searchContext).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Search not from UI — skipping analytics.'),
      expect.stringContaining('user='),
      'referer=(none)',
      expect.stringContaining('searchTerm='),
      expect.stringContaining('userAgent='),
    );
  });

  it('does NOT set searchContext for permission-tester / API-tool referer', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = makeRequest('https://internal-tools.example.com/permission-tester');
    extractSearchContext(req, contentAIBody);
    expect(req.searchContext).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logs error for unrecognized body format but does not crash', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = makeRequest('https://koassets.adobe.com/search/all');
    extractSearchContext(req, { unexpected: true });
    expect(req.searchContext).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unrecognized search body format'));
  });
});
