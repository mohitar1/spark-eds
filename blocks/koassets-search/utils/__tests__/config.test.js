import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { buildSearchUrlWithCampaignFilter } from '../config.js';

describe('buildSearchUrlWithCampaignFilter', () => {
  beforeEach(() => {
    delete global.window;
    global.window = {
      location: {
        href: 'https://koassets.adobecocacola.workers.dev/en/search/assets',
        origin: 'https://koassets.adobecocacola.workers.dev',
        pathname: '/en/search/assets',
      },
    };
  });

  it('should create a URL with facetFilters for campaign (asean-coca-cola-festive)', () => {
    // Expected result: https://koassets.adobecocacola.workers.dev/en/search/assets?facetFilters=%7B%22tccc-campaignName%22%3A%7B%22asean-coca-cola-festive%22%3Atrue%7D%7D
    const result = buildSearchUrlWithCampaignFilter('asean-coca-cola-festive');
    const url = new URL(result);

    expect(url.origin).toBe('https://koassets.adobecocacola.workers.dev');
    expect(url.pathname).toBe('/en/search/assets');

    const facetFiltersParam = url.searchParams.get('facetFilters');
    expect(facetFiltersParam).toBeTruthy();

    const facetFilters = JSON.parse(facetFiltersParam);
    expect(facetFilters).toEqual({
      'tccc-campaignName': {
        'asean-coca-cola-festive': true,
      },
    });
  });
});
