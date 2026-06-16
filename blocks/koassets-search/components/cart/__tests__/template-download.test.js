/* eslint-env node */
import {
  describe, it, expect, vi,
} from 'vitest';

// Mock all external dependencies so the module loads in Node
vi.mock('../../../../../scripts/cart-state.js', () => ({
  getState: vi.fn(() => ({ cartTemplateItems: [] })),
  setState: vi.fn(),
  saveCartTemplateItems: vi.fn(),
}));

vi.mock('../../../constants/cart.js', () => ({
  TEMPLATE_DOWNLOAD_ENDPOINT: '/bin/tccc/templatedownload',
  TEMPLATE_POLL_INTERVAL: 3000,
  TEMPLATE_POLL_MAX_DURATION: 60000,
}));

vi.mock('../../template-modals.js', () => ({
  AEM_AUTH_ERROR: 'Authentication required',
}));

vi.mock('../../../clients/dynamicmedia-client.js', () => ({
  getDownloadType: vi.fn((item) => item.readyToUse || 'ready-to-use'),
}));

vi.mock('../../../../../scripts/utils/uuid.js', () => ({
  generateUUID: vi.fn(() => 'test-download-uuid'),
}));

vi.mock('../../../../../scripts/asset-id-utils.js', () => ({
  getDisplayAssetId: vi.fn((id) => {
    const prefix = 'urn:aaid:aem:';
    if (!id) return '';
    return id.startsWith(prefix) ? id.substring(prefix.length) : id;
  }),
}));

vi.mock('../../../../../scripts/utils/template-metadata.js', () => ({
  fetchJcrMetadata: vi.fn(),
  extractAnalyticsFields: vi.fn(),
  normalizeContentHubId: vi.fn((id) => id || ''),
  lookupAssetIdByPath: vi.fn(),
  MY_TEMPLATES_API: '/bin/tccc/mytemplates.json?limit=2000',
}));

const {
  _getBaseTemplatePath: getBaseTemplatePath,
  _findTemplateByPath: findTemplateByPath,
  _buildAnalyticsContext: buildAnalyticsContext,
} = await import('../template-download.js');

// ─── getBaseTemplatePath ───────────────────────────────

describe('getBaseTemplatePath', () => {
  it('returns baseTemplate property', () => {
    expect(getBaseTemplatePath({ baseTemplate: '/dam/base.xml' }))
      .toBe('/dam/base.xml');
  });

  it('falls back to dam:baseTemplate', () => {
    expect(getBaseTemplatePath({ 'dam:baseTemplate': '/dam/base2.xml' }))
      .toBe('/dam/base2.xml');
  });

  it('falls back to tccc:baseTemplate', () => {
    expect(getBaseTemplatePath({ 'tccc:baseTemplate': '/dam/base3.xml' }))
      .toBe('/dam/base3.xml');
  });

  it('returns empty string when no base template property exists', () => {
    expect(getBaseTemplatePath({})).toBe('');
    expect(getBaseTemplatePath({ otherProp: 'value' })).toBe('');
  });

  it('prefers baseTemplate over alternatives', () => {
    expect(getBaseTemplatePath({
      baseTemplate: '/dam/first.xml',
      'dam:baseTemplate': '/dam/second.xml',
      'tccc:baseTemplate': '/dam/third.xml',
    })).toBe('/dam/first.xml');
  });
});

// ─── findTemplateByPath ────────────────────────────────

describe('findTemplateByPath', () => {
  const templates = [
    { path: '/content/dam/templates/A.xml', title: 'A' },
    { path: '/content/dam/templates/B Template.xml', title: 'B' },
    { templatePath: '/content/dam/templates/C.xml', title: 'C' },
  ];

  it('matches exact path', () => {
    const match = findTemplateByPath(templates, '/content/dam/templates/A.xml');
    expect(match?.title).toBe('A');
  });

  it('matches URL-encoded path against decoded API path', () => {
    const match = findTemplateByPath(
      templates,
      '/content/dam/templates/B%20Template.xml',
    );
    expect(match?.title).toBe('B');
  });

  it('matches via templatePath fallback', () => {
    const match = findTemplateByPath(templates, '/content/dam/templates/C.xml');
    expect(match?.title).toBe('C');
  });

  it('returns undefined when no match', () => {
    expect(findTemplateByPath(templates, '/content/dam/templates/Z.xml'))
      .toBeUndefined();
  });

  it('handles empty templates array', () => {
    expect(findTemplateByPath([], '/content/dam/templates/A.xml'))
      .toBeUndefined();
  });
});

// ─── buildAnalyticsContext ─────────────────────────────

describe('buildAnalyticsContext', () => {
  it('uses base template ID as assetId and copy ID as publicationId for customized templates', () => {
    const items = [{
      baseTemplateId: 'urn:aaid:aem:base-uuid-1234',
      contentHubId: 'urn:aaid:aem:copy-uuid-5678',
      brand: 'Coca-Cola',
      campaignName: 'Summer 2026',
      selectedRenditions: ['original'],
    }];

    const ctx = buildAnalyticsContext(items);

    expect(ctx.downloadId).toBe('test-download-uuid');
    expect(ctx.resourceType).toBe('template');
    expect(ctx.assets).toHaveLength(1);

    const asset = ctx.assets[0];
    expect(asset.assetId).toBe('base-uuid-1234');
    expect(asset.publicationId).toBe('copy-uuid-5678');
    expect(asset.brand).toBe('Coca-Cola');
    expect(asset.campaign).toBe('Summer 2026');
  });

  it('uses contentHubId as assetId with empty publicationId for non-customized templates', () => {
    const items = [{
      baseTemplateId: '',
      contentHubId: 'urn:aaid:aem:template-uuid',
      brand: 'Sprite',
      campaignName: 'Winter',
      selectedRenditions: [],
    }];

    const ctx = buildAnalyticsContext(items);
    const asset = ctx.assets[0];
    expect(asset.assetId).toBe('template-uuid');
    expect(asset.publicationId).toBe('');
  });

  it('falls back to item.assetId when contentHubId is missing', () => {
    const items = [{
      baseTemplateId: '',
      contentHubId: '',
      assetId: '/content/dam/templates/Fallback.xml',
      brand: 'Fanta',
      campaignName: '',
      selectedRenditions: [],
    }];

    const ctx = buildAnalyticsContext(items);
    const asset = ctx.assets[0];
    expect(asset.assetId).toBe('/content/dam/templates/Fallback.xml');
    expect(asset.publicationId).toBe('');
  });

  it('defaults brand and campaign to "unknown" when missing', () => {
    const items = [{
      baseTemplateId: '',
      contentHubId: 'urn:aaid:aem:abc',
      brand: '',
      campaignName: '',
      selectedRenditions: [],
    }];

    const ctx = buildAnalyticsContext(items);
    expect(ctx.assets[0].brand).toBe('unknown');
    expect(ctx.assets[0].campaign).toBe('unknown');
  });

  it('handles multiple items', () => {
    const items = [
      {
        baseTemplateId: 'urn:aaid:aem:base-1',
        contentHubId: 'urn:aaid:aem:copy-1',
        brand: 'A',
        campaignName: 'B',
        selectedRenditions: ['original'],
      },
      {
        baseTemplateId: '',
        contentHubId: 'urn:aaid:aem:standalone',
        brand: 'C',
        campaignName: 'D',
        selectedRenditions: ['HighResPDF'],
      },
    ];

    const ctx = buildAnalyticsContext(items);
    expect(ctx.assets).toHaveLength(2);
    expect(ctx.assets[0].publicationId).toBe('copy-1');
    expect(ctx.assets[1].publicationId).toBe('');
  });
});
