import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  vi,
} from 'vitest';

const {
  formatDateMock,
  loadMarketChannelRightsMock,
  loadMediaRightsMock,
  formatMarketsOrMediaMock,
} = vi.hoisted(() => ({
  formatDateMock: vi.fn((value) => (value ? `fmt:${value}` : '')),
  loadMarketChannelRightsMock: vi.fn(),
  loadMediaRightsMock: vi.fn(),
  formatMarketsOrMediaMock: vi.fn((value) => {
    if (Array.isArray(value)) {
      return value.map((item) => item?.name || String(item)).join(', ');
    }
    if (value && typeof value === 'object') return value.name || '';
    return value ? String(value) : '';
  }),
}));

vi.mock('../../../scripts/rights-management/date-formatter.js', () => ({
  formatDate: formatDateMock,
}));

vi.mock('../../../scripts/rights-management/rights-utils.js', () => ({
  REVIEWER_CHANGEABLE_STATUSES: ['Not Started', 'In Review', 'Approved'],
}));

vi.mock('../../koassets-search/components/facets/market-channels.js', () => ({
  loadMarketChannelRights: loadMarketChannelRightsMock,
}));

vi.mock('../../koassets-search/components/facets/media-channels.js', () => ({
  loadMediaRights: loadMediaRightsMock,
}));

vi.mock('../../koassets-search/utils/fadel-options-utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatMarketsOrMedia: formatMarketsOrMediaMock,
  };
});

let normalizeDataSource;
let buildDetailFieldOptionsFromConfig;
let getSubmitterFieldMap;
let getSubmitterFieldsWithConfig;
let getReviewFieldMeta;
let buildReviewFieldOptionsFromConfig;
let getIntendedUsageFieldMeta;
let getMaterialsFieldMeta;
let getBudgetFieldMeta;
let deepMerge;

describe('my-rights-review-details/transformers', () => {
  beforeAll(async () => {
    ({
      normalizeDataSource,
      buildDetailFieldOptionsFromConfig,
      getSubmitterFieldMap,
      getSubmitterFieldsWithConfig,
      getReviewFieldMeta,
      buildReviewFieldOptionsFromConfig,
      getIntendedUsageFieldMeta,
      getMaterialsFieldMeta,
      getBudgetFieldMeta,
      deepMerge,
    } = await import('../transformers.js'));
  });

  beforeEach(() => {
    formatDateMock.mockClear();
    formatMarketsOrMediaMock.mockClear();
    loadMarketChannelRightsMock.mockClear();
    loadMediaRightsMock.mockClear();
  });

  describe('normalizeDataSource', () => {
    it('normalizes null, object and array inputs', () => {
      expect(normalizeDataSource(null)).toEqual([]);
      expect(normalizeDataSource([{ value: 'a', text: 'A' }])).toEqual([
        { value: 'a', text: 'A' },
      ]);
      expect(normalizeDataSource({ value: 'x', text: 'X' })).toEqual([
        { value: 'x', text: 'X' },
      ]);
      expect(normalizeDataSource({ foo: 'bar' })).toEqual([]);
    });
  });

  describe('buildDetailFieldOptionsFromConfig', () => {
    it('returns read-only base options when editField is false', () => {
      const opts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'name', editField: false },
        'Name',
        'Alice',
        'associateAgency.name',
      );

      expect(opts).toEqual({
        label: 'Name',
        value: 'Alice',
        propertyKey: 'name',
        name: 'associateAgency.name',
        editable: false,
      });
    });

    it('reuses facet loaders for Fadel markets/media endpoints', async () => {
      loadMarketChannelRightsMock.mockResolvedValue({
        attribute: [
          {
            id: '1',
            right: { rightId: '0', description: 'All Markets' },
            childrenLst: [],
          },
        ],
      });
      loadMediaRightsMock.mockResolvedValue({
        attribute: [
          {
            id: '100',
            right: { rightId: '0', description: 'All Media' },
            childrenLst: [],
          },
        ],
      });

      const marketOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'marketsCovered', editField: true, apiEndpoint: '/api/rights/search/30' },
        'Markets',
        '',
      );
      const mediaOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'mediaRights', editField: true, apiEndpoint: '/api/rights/search/20' },
        'Media',
        '',
      );

      expect(marketOpts.type).toBe('select');
      expect(marketOpts.multiple).toBe(true);
      expect(mediaOpts.type).toBe('select');
      expect(mediaOpts.multiple).toBe(true);

      await expect(marketOpts.fetchFromApi()).resolves.toEqual({
        topOptions: [{ value: '1', text: 'All Markets' }],
        groups: [],
      });
      await expect(mediaOpts.fetchFromApi()).resolves.toEqual({
        topOptions: [{ value: '100', text: 'All Media' }],
        groups: [],
      });
      expect(loadMarketChannelRightsMock).toHaveBeenCalledTimes(1);
      expect(loadMediaRightsMock).toHaveBeenCalledTimes(1);
    });

    it('maps DA config type-ahead flags for select fields', () => {
      const marketOpts = buildDetailFieldOptionsFromConfig(
        {
          propertyName: 'marketsCovered',
          editField: true,
          apiEndpoint: '/api/rights/search/30',
          typeAhead: 'true',
          searchPlaceholder: 'Search markets...',
        },
        'Markets',
        '',
      );

      const statusOpts = buildDetailFieldOptionsFromConfig(
        {
          propertyName: 'rightsRequestStatus',
          editField: true,
          dataSource: [{ value: 'new', text: 'New' }],
          searchable: true,
        },
        'Status',
        'new',
      );

      expect(marketOpts.type).toBe('select');
      expect(marketOpts.searchable).toBe(true);
      expect(marketOpts.searchPlaceholder).toBe('Search markets...');
      expect(statusOpts.type).toBe('select');
      expect(statusOpts.searchable).toBe(true);
    });

    it('transforms hierarchical rights from facet loader responses', async () => {
      loadMarketChannelRightsMock.mockResolvedValue({
        attribute: [
          {
            id: '1',
            right: { rightId: '0', description: 'All Markets' },
            childrenLst: [
              {
                id: '2',
                right: { rightId: '10', description: 'North America' },
                childrenLst: [
                  {
                    id: '3',
                    right: { rightId: '11', description: 'United States' },
                  },
                ],
              },
            ],
          },
        ],
      });
      loadMediaRightsMock.mockResolvedValue({
        attribute: [
          {
            id: '100',
            right: { rightId: '0', description: 'All Media' },
            childrenLst: [
              {
                id: '101',
                right: { rightId: '20', description: 'Digital' },
                childrenLst: [],
              },
              {
                id: '102',
                right: { rightId: '21', description: 'TV' },
                childrenLst: [],
              },
            ],
          },
        ],
      });

      const marketOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'marketsCovered', editField: true, apiEndpoint: '/api/rights/search/30' },
        'Markets',
        '',
      );
      const mediaOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'mediaRights', editField: true, apiEndpoint: '/api/rights/search/20' },
        'Media',
        '',
      );

      await expect(marketOpts.fetchFromApi()).resolves.toEqual({
        topOptions: [{ value: '1', text: 'All Markets' }],
        groups: [
          {
            label: 'North America',
            options: [
              { value: '2', text: 'North America' },
              { value: '3', text: 'United States' },
            ],
          },
        ],
      });
      await expect(mediaOpts.fetchFromApi()).resolves.toEqual({
        topOptions: [{ value: '100', text: 'All Media' }],
        groups: [
          {
            label: 'Digital',
            options: [{ value: '101', text: 'Digital' }],
          },
          {
            label: 'TV',
            options: [{ value: '102', text: 'TV' }],
          },
        ],
      });
      expect(loadMarketChannelRightsMock).toHaveBeenCalledTimes(1);
      expect(loadMediaRightsMock).toHaveBeenCalledTimes(1);
    });

    it('builds select/date/textarea/text types from config content', () => {
      const selectOpts = buildDetailFieldOptionsFromConfig(
        {
          propertyName: 'rightsRequestStatus',
          editField: true,
          dataSource: [{ value: 'new', text: 'New' }],
        },
        'Status',
        'new',
      );
      const dateOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'rightsStartDate', editField: true },
        'Start',
        '2026-01-01',
      );
      const textareaOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'exceptionsOrNotes', editField: true },
        'Notes',
        '',
      );
      const quoteDetailsOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'quoteDetails', editField: true },
        'Quote Details',
        '',
      );
      const textOpts = buildDetailFieldOptionsFromConfig(
        { propertyName: 'contactName', editField: true },
        'Contact',
        '',
      );

      expect(selectOpts).toMatchObject({ type: 'select', editable: true });
      expect(dateOpts.type).toBe('date');
      expect(textareaOpts.type).toBe('textarea');
      expect(quoteDetailsOpts.type).toBe('textarea');
      expect(textOpts.type).toBe('text');
    });

    it('uses usageRightsRequired options from DA dataSource', () => {
      const opts = buildDetailFieldOptionsFromConfig(
        {
          propertyName: 'materialsNeeded.usageRightsRequired',
          editField: true,
          dataSource: [{ value: 'x', text: 'X' }],
        },
        'Usage Rights Required',
        ['Music'],
      );

      expect(opts.type).toBe('checkboxes');
      expect(opts.options).toEqual([{ value: 'x', text: 'X' }]);
    });

    it('falls back to default usageRightsRequired options when dataSource is invalid', () => {
      const opts = buildDetailFieldOptionsFromConfig(
        {
          propertyName: 'materialsNeeded.usageRightsRequired',
          editField: true,
          dataSource: [{ foo: 'bar' }],
        },
        'Usage Rights Required',
        ['Music'],
      );

      expect(opts.type).toBe('checkboxes');
      expect(opts.options).toEqual([
        { value: 'Music', text: 'Music' },
        { value: 'Talent', text: 'Talent' },
        { value: 'Photographer', text: 'Photographer' },
        { value: 'Voiceover', text: 'Voiceover' },
        { value: 'Stock Footage', text: 'Stock Footage' },
      ]);
    });
  });

  describe('submitter mapping', () => {
    it('returns agency field map for agency requests', () => {
      const map = getSubmitterFieldMap({
        rightsRequestDetails: {
          associateAgency: { agencyOrTcccAssociate: 'Agency' },
        },
      });

      expect(map).toHaveLength(4);
      expect(map[0].propertyName).toBe('agentType');
      expect(map[1].propertyName).toBe('name');
    });

    it('merges config with mapped fields and translated labels', () => {
      const request = {
        rightsRequestDetails: {
          associateAgency: {
            agencyOrTcccAssociate: 'agency',
            name: 'Acme',
            emailAddress: 'team@example.com',
            phoneNumber: '+1 555 0100',
          },
        },
      };
      const fields = getSubmitterFieldsWithConfig(
        request,
        (key, fallback) => `${fallback} (${key})`,
        [{ propertyName: 'name', editField: true }],
      );

      const nameField = fields.find((f) => f.propertyName === 'name');
      expect(nameField.value).toBe('Acme');
      expect(nameField.label).toContain('Name of TCCC Client');
      expect(nameField.configItem.editField).toBe(true);
    });
  });

  describe('review/intended/materials/budget meta', () => {
    it('builds review meta and formats assigned date', () => {
      const meta = getReviewFieldMeta({
        rightsRequestReviewDetails: {
          rightsRequestStatus: 'In Review',
          rightsReviewer: 'reviewer@example.com',
        },
        reviewInfo: { assignedDate: '2026-02-01' },
      });

      expect(meta.rightsRequestStatus.value).toBe('In Review');
      expect(meta.rightsReviewer.value).toBe('reviewer@example.com');
      expect(meta.assignedDate.value).toBe('fmt:2026-02-01');
      expect(formatDateMock).toHaveBeenCalledWith('2026-02-01');
    });

    it('injects reviewer-changeable status options when needed', () => {
      const opts = buildReviewFieldOptionsFromConfig(
        {
          propertyName: 'rightsRequestStatus',
          editField: true,
          apiEndpoint: '/api/statuses',
        },
        'Status',
        'In Review',
      );

      expect(opts.type).toBe('select');
      expect(opts.options).toEqual([
        { value: 'Not Started', text: 'Not Started' },
        { value: 'In Review', text: 'In Review' },
        { value: 'Approved', text: 'Approved' },
      ]);
      expect('fetchFromApi' in opts).toBe(false);
    });

    it('builds intended usage meta with raw value conversion', () => {
      const meta = getIntendedUsageFieldMeta({
        rightsRequestDetails: {
          intendedUsage: {
            rightsStartDate: '2026-01-01',
            rightsEndDate: '2026-02-01',
            marketsCovered: [{ id: 'm1', name: 'US' }],
            mediaRights: 'tv',
          },
        },
      });

      expect(meta.rightsStartDate.value).toBe('fmt:2026-01-01');
      expect(meta.rightsEndDate.value).toBe('fmt:2026-02-01');
      expect(meta.marketsCovered.rawValue).toEqual(['m1']);
      expect(meta.mediaRights.rawValue).toEqual(['tv']);
    });

    it('builds materials and budget meta values', () => {
      const materialsMeta = getMaterialsFieldMeta({
        rightsRequestDetails: {
          materialsNeeded: {
            dateRequiredBy: '2026-03-01',
            formatsRequiredBy: 'mp4',
            usageRightsRequired: ['Streaming', 'Social'],
            plannedAdaptations: 'Subtitles',
          },
        },
      });
      const budgetMeta = getBudgetFieldMeta(
        {
          rightsRequestDetails: {
            budgetForUsage: {
              budgetForMarket: '1000',
              exceptionsOrNotes: 'None',
              quoteDetails: 'Quote 123',
            },
          },
        },
        (key, fallback) => `${fallback} (${key})`,
      );

      expect(materialsMeta.usageRightsRequired.value).toBe('Streaming, Social');
      expect(budgetMeta.budgetForMarket.label).toContain('budgetForMarket');
      expect(budgetMeta.exceptionsOrNotes.value).toBe('None');
      expect(budgetMeta.quoteDetails.value).toBe('Quote 123');
    });
  });

  describe('deepMerge', () => {
    it('merges nested objects and overwrites non-objects', () => {
      const target = {
        rightsRequestDetails: {
          associateAgency: { name: 'Old' },
          marketsCovered: ['old'],
        },
      };
      const src = {
        rightsRequestDetails: {
          associateAgency: { emailAddress: 'new@example.com' },
          marketsCovered: ['new'],
        },
      };

      deepMerge(target, src);

      expect(target).toEqual({
        rightsRequestDetails: {
          associateAgency: {
            name: 'Old',
            emailAddress: 'new@example.com',
          },
          marketsCovered: ['new'],
        },
      });
    });
  });
});
