/* eslint-env node */
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../asset-transformers.js', () => ({
  populateAssetFromMetadata: vi.fn(({ assetMetadata }) => ({
    brand: assetMetadata?.['tccc:brand'] || 'N/A',
    campaignName: assetMetadata?.['tccc:campaignName'] || 'N/A',
  })),
}));

vi.mock('../../asset-id-utils.js', () => ({
  ASSET_ID_PREFIX: 'urn:aaid:aem:',
  normalizeAssetId: vi.fn((id) => {
    if (!id) return id;
    const trimmed = id.trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!trimmed.startsWith('urn:aaid:aem:') && UUID_RE.test(trimmed)) {
      return `urn:aaid:aem:${trimmed}`;
    }
    return trimmed;
  }),
}));

const {
  fetchJcrMetadata,
  fetchJcrAssetUuid,
  isPopulated,
  extractAnalyticsFields,
  normalizeContentHubId,
  lookupAssetIdByPath,
} = await import('../template-metadata.js');

// ─── Helpers ───────────────────────────────────────────

function mockFetch(response) {
  global.fetch = vi.fn(() => Promise.resolve(response));
}

function mockFetchJson(data, ok = true) {
  mockFetch({ ok, json: () => Promise.resolve(data) });
}

// ─── Tests ─────────────────────────────────────────────

describe('isPopulated', () => {
  it('returns true for non-empty strings', () => {
    expect(isPopulated('Coca-Cola')).toBe(true);
  });

  it('returns false for N/A', () => {
    expect(isPopulated('N/A')).toBe(false);
  });

  it('returns false for empty/null/undefined', () => {
    expect(isPopulated('')).toBe(false);
    expect(isPopulated(null)).toBe(false);
    expect(isPopulated(undefined)).toBe(false);
  });
});

describe('normalizeContentHubId', () => {
  it('returns empty string for falsy input', () => {
    expect(normalizeContentHubId('')).toBe('');
    expect(normalizeContentHubId(null)).toBe('');
    expect(normalizeContentHubId(undefined)).toBe('');
  });

  it('returns URN unchanged if already prefixed', () => {
    const urn = 'urn:aaid:aem:7c2eb8e8-7c55-4484-b236-bc9ccdb7117a';
    expect(normalizeContentHubId(urn)).toBe(urn);
  });

  it('adds URN prefix to bare UUID', () => {
    const uuid = '7c2eb8e8-7c55-4484-b236-bc9ccdb7117a';
    expect(normalizeContentHubId(uuid))
      .toBe('urn:aaid:aem:7c2eb8e8-7c55-4484-b236-bc9ccdb7117a');
  });

  it('returns non-UUID strings as-is', () => {
    expect(normalizeContentHubId('not-a-uuid')).toBe('not-a-uuid');
  });
});

describe('extractAnalyticsFields', () => {
  it('extracts brand, campaign, and contentHubId from metadata', () => {
    const meta = {
      'tccc:brand': 'Coca-Cola',
      'tccc:campaignName': 'Summer 2026',
      'dam:assetId': 'urn:aaid:aem:abc-123',
    };
    const result = extractAnalyticsFields(meta, '/content/dam/test.xml');
    expect(result.brand).toBe('Coca-Cola');
    expect(result.campaignName).toBe('Summer 2026');
    expect(result.contentHubId).toBe('urn:aaid:aem:abc-123');
  });

  it('returns empty strings when metadata lacks fields', () => {
    const result = extractAnalyticsFields({}, '/content/dam/test.xml');
    expect(result.brand).toBe('');
    expect(result.campaignName).toBe('');
    expect(result.contentHubId).toBe('');
  });

  it('uses filename from templatePath for repo:name', async () => {
    const transformers = await import('../../asset-transformers.js');
    const spy = vi.mocked(transformers.populateAssetFromMetadata);
    spy.mockClear();

    extractAnalyticsFields({}, '/content/dam/folder/Template.xml');

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryMetadata: { 'repo:name': 'Template.xml' },
      }),
    );
  });
});

describe('fetchJcrMetadata', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for empty path', async () => {
    expect(await fetchJcrMetadata('')).toBeNull();
    expect(await fetchJcrMetadata(null)).toBeNull();
  });

  it('fetches jcr:content/metadata.json with credentials', async () => {
    const meta = { 'tccc:brand': 'Sprite' };
    mockFetchJson(meta);

    const result = await fetchJcrMetadata('/content/dam/test.xml');
    expect(result).toEqual(meta);
    expect(global.fetch).toHaveBeenCalledWith(
      '/content/dam/test.xml/jcr:content/metadata.json',
      { credentials: 'include' },
    );
  });

  it('returns null on non-ok response', async () => {
    mockFetch({ ok: false });
    expect(await fetchJcrMetadata('/content/dam/test.xml')).toBeNull();
  });

  it('returns null on network error', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    expect(await fetchJcrMetadata('/content/dam/test.xml')).toBeNull();
  });
});

describe('fetchJcrAssetUuid', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty string for empty/null path', async () => {
    expect(await fetchJcrAssetUuid('')).toBe('');
    expect(await fetchJcrAssetUuid(null)).toBe('');
  });

  it('fetches {path}.json with credentials and returns jcr:uuid', async () => {
    mockFetchJson({ 'jcr:uuid': 'f64b204a-586b-48d2-ad18-ec10e11218d4', 'jcr:primaryType': 'dam:Asset' });

    const result = await fetchJcrAssetUuid('/content/dam/tccc-user/MIC/template.xml');
    expect(result).toBe('f64b204a-586b-48d2-ad18-ec10e11218d4');
    expect(global.fetch).toHaveBeenCalledWith(
      '/content/dam/tccc-user/MIC/template.xml.json',
      { credentials: 'include' },
    );
  });

  it('returns empty string when jcr:uuid is absent from response', async () => {
    mockFetchJson({ 'jcr:primaryType': 'dam:Asset' });
    expect(await fetchJcrAssetUuid('/content/dam/test.xml')).toBe('');
  });

  it('returns empty string on non-ok response', async () => {
    mockFetch({ ok: false });
    expect(await fetchJcrAssetUuid('/content/dam/test.xml')).toBe('');
  });

  it('returns empty string on network error', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    expect(await fetchJcrAssetUuid('/content/dam/test.xml')).toBe('');
  });
});

describe('lookupAssetIdByPath', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty string for empty/null path', async () => {
    expect(await lookupAssetIdByPath('')).toBe('');
    expect(await lookupAssetIdByPath(null)).toBe('');
  });

  it('returns empty string for path with no filename', async () => {
    expect(await lookupAssetIdByPath('/')).toBe('');
  });

  it('sends Content AI search with correct body', async () => {
    mockFetchJson({ hits: { results: [] } });

    await lookupAssetIdByPath('/content/dam/templates/Banner.xml');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/adobe/assets/contentai/search',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          query: [{
            match: {
              text: 'Banner.xml',
              fields: ['repositoryMetadata.repo:name'],
            },
          }],
          limit: 5,
        }),
      }),
    );
  });

  it('prefers exact repo:name match over first hit', async () => {
    mockFetchJson({
      hits: {
        results: [
          { assetId: 'urn:aaid:aem:wrong', repositoryMetadata: { 'repo:name': 'Banner Copy.xml' } },
          { assetId: 'urn:aaid:aem:correct', repositoryMetadata: { 'repo:name': 'Banner.xml' } },
        ],
      },
    });

    const result = await lookupAssetIdByPath('/content/dam/templates/Banner.xml');
    expect(result).toBe('urn:aaid:aem:correct');
  });

  it('falls back to first hit when no exact match', async () => {
    mockFetchJson({
      hits: {
        results: [
          { assetId: 'urn:aaid:aem:first', repositoryMetadata: { 'repo:name': 'Banner v2.xml' } },
        ],
      },
    });

    const result = await lookupAssetIdByPath('/content/dam/templates/Banner.xml');
    expect(result).toBe('urn:aaid:aem:first');
  });

  it('returns empty string when no hits', async () => {
    mockFetchJson({ hits: { results: [] } });
    expect(await lookupAssetIdByPath('/content/dam/templates/Banner.xml')).toBe('');
  });

  it('returns empty string on non-ok response', async () => {
    mockFetch({ ok: false });
    expect(await lookupAssetIdByPath('/content/dam/templates/Banner.xml')).toBe('');
  });

  it('returns empty string on network error', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    expect(await lookupAssetIdByPath('/content/dam/templates/Banner.xml')).toBe('');
  });

  it('handles response with missing hits structure', async () => {
    mockFetchJson({});
    expect(await lookupAssetIdByPath('/content/dam/templates/Banner.xml')).toBe('');
  });
});
