import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  vi,
} from 'vitest';

const { stripHtmlAndNewlinesMock } = vi.hoisted(() => ({
  stripHtmlAndNewlinesMock: vi.fn((text) => {
    if (typeof text !== 'string') return text;
    return text.replace(/<[^>]*>/g, '').replace(/\n/g, '').trim();
  }),
}));

vi.mock('../../../scripts/scripts.js', () => ({
  stripHtmlAndNewlines: stripHtmlAndNewlinesMock,
}));

let parseFieldConfig;
let getReviewDetailsBlockConfig;

describe('my-rights-review-details/config', () => {
  beforeAll(async () => {
    ({
      parseFieldConfig,
      getReviewDetailsBlockConfig,
    } = await import('../config.js'));
  });

  beforeEach(() => {
    stripHtmlAndNewlinesMock.mockClear();
  });

  describe('parseFieldConfig', () => {
    it('returns empty array for null and object inputs', () => {
      expect(parseFieldConfig(null)).toEqual([]);
      expect(parseFieldConfig({ propertyName: 'name', editField: true })).toEqual([]);
    });

    it('returns original array when input is already an array', () => {
      const raw = [{ propertyName: 'name', editField: true }];
      expect(parseFieldConfig(raw)).toBe(raw);
    });

    it('parses cleaned JSON array strings', () => {
      const raw = '\n<p>[{"propertyName":"name","editField":true}]</p>\n';
      expect(parseFieldConfig(raw)).toEqual([
        { propertyName: 'name', editField: true },
      ]);
    });

    it('returns empty array for invalid or non-array JSON', () => {
      expect(parseFieldConfig('{not valid json')).toEqual([]);
      expect(parseFieldConfig('{"propertyName":"name"}')).toEqual([]);
    });
  });

  describe('getReviewDetailsBlockConfig', () => {
    it('parses per-key config values and normalizes booleans/numbers', () => {
      const config = getReviewDetailsBlockConfig({
        submitterFieldConfig: '[{"propertyName":"name","editField":true}]',
        reviewFieldConfig: '[{"propertyName":"rightsRequestStatus","editField":true}]',
        intendedUsageFieldConfig: '',
        materialsFieldConfig: '[]',
        budgetFieldConfig: '[{"propertyName":"exceptionsOrNotes","editField":false}]',
        assetsSectionEditable: 'true',
        assetsSectionMinLimit: '3',
        assetsSectionMaxLimit: '10',
      });

      expect(config.submitterFieldConfig).toEqual([
        { propertyName: 'name', editField: true },
      ]);
      expect(config.reviewFieldConfig).toEqual([
        { propertyName: 'rightsRequestStatus', editField: true },
      ]);
      expect(config.materialsFieldConfig).toEqual([]);
      expect(config.budgetFieldConfig).toEqual([
        { propertyName: 'exceptionsOrNotes', editField: false },
      ]);
      expect(config.assetsSectionEditable).toBe(true);
      expect(config.assetsSectionMinLimit).toBe(3);
      expect(config.assetsSectionMaxLimit).toBe(10);
    });

    it('uses nested JSON object config when found in any value cell', () => {
      const nested = JSON.stringify({
        submitterFieldConfig: [{ propertyName: 'emailAddress', editField: true }],
        reviewFieldConfig: [{ propertyName: 'rightsReviewer', editField: false }],
        assetsSectionEditable: true,
        assetsSectionMinLimit: '0',
        assetsSectionMaxLimit: '2',
      });

      const config = getReviewDetailsBlockConfig({
        submitterFieldConfig: '[{"propertyName":"name","editField":false}]',
        fullConfigJson: nested,
      });

      expect(config.submitterFieldConfig).toEqual([
        { propertyName: 'emailAddress', editField: true },
      ]);
      expect(config.reviewFieldConfig).toEqual([
        { propertyName: 'rightsReviewer', editField: false },
      ]);
      expect(config.assetsSectionEditable).toBe(true);
      expect(config.assetsSectionMinLimit).toBe(1);
      expect(config.assetsSectionMaxLimit).toBe(2);
    });

    it('falls back to sane defaults for missing/invalid min limit', () => {
      const config = getReviewDetailsBlockConfig({
        assetsSectionEditable: false,
        assetsSectionMinLimit: 'not-a-number',
      });

      expect(config.assetsSectionEditable).toBe(false);
      expect(config.assetsSectionMinLimit).toBe(1);
      expect(config.assetsSectionMaxLimit).toBe(25);
    });

    it('accepts case-insensitive and numeric/yes-no boolean values for assetsSectionEditable', () => {
      expect(getReviewDetailsBlockConfig({
        assetsSectionEditable: ' TRUE ',
      }).assetsSectionEditable).toBe(true);

      expect(getReviewDetailsBlockConfig({
        assetsSectionEditable: '1',
      }).assetsSectionEditable).toBe(true);

      expect(getReviewDetailsBlockConfig({
        assetsSectionEditable: 'yes',
      }).assetsSectionEditable).toBe(true);

      expect(getReviewDetailsBlockConfig({
        assetsSectionEditable: ' FALSE ',
      }).assetsSectionEditable).toBe(false);
    });

    it('parses HTML-wrapped scalar config values from block table cells', () => {
      const config = getReviewDetailsBlockConfig({
        assetsSectionEditable: '<p>TRUE</p>',
        assetsSectionMinLimit: '<p>2</p>',
        assetsSectionMaxLimit: '<p>6</p>',
      });

      expect(config.assetsSectionEditable).toBe(true);
      expect(config.assetsSectionMinLimit).toBe(2);
      expect(config.assetsSectionMaxLimit).toBe(6);
    });

    it('clamps max limit to min limit when provided max is smaller', () => {
      const config = getReviewDetailsBlockConfig({
        assetsSectionMinLimit: '5',
        assetsSectionMaxLimit: '2',
      });

      expect(config.assetsSectionMinLimit).toBe(5);
      expect(config.assetsSectionMaxLimit).toBe(5);
    });
  });
});
