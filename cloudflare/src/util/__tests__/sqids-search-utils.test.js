import { describe, expect, it } from 'vitest';
import { decodePathIds, replaceMatchTextWithAssetTerm } from '../sqids-search-utils.js';
import { encodeId } from '../sqids-utils.js';

const ALPHABET = '8gGQeDOJsS069Pod4mU2BKWRXjpiThLkZEHCantwuV7IrcqfAzMbN3vx1YlF5y';
const ASSET_URN = 'urn:aaid:aem:12345678-1234-1234-1234-1234567890ab';
const ASSET_TOKEN = encodeId(ASSET_URN, ALPHABET);

describe('decodePathIds', () => {
  it('decodes a Sqids token in an asset path', () => {
    expect(decodePathIds(`/adobe/assets/${ASSET_TOKEN}`, ALPHABET), 'should replace token with decoded URN').toBe(
      `/adobe/assets/${ASSET_URN}`,
    );
  });

  it('decodes a Sqids token with a trailing sub-path', () => {
    expect(
      decodePathIds(`/adobe/assets/${ASSET_TOKEN}/metadata`, ALPHABET),
      'should preserve sub-path after decoded URN',
    ).toBe(`/adobe/assets/${ASSET_URN}/metadata`);
  });

  it('passes through a real URN unchanged', () => {
    expect(decodePathIds(`/adobe/assets/${ASSET_URN}/metadata`, ALPHABET), 'real URN should not be modified').toBe(
      `/adobe/assets/${ASSET_URN}/metadata`,
    );
  });

  it('skips known non-ID segments: collections', () => {
    expect(
      decodePathIds('/adobe/assets/collections/search', ALPHABET),
      'collections segment should not be decoded',
    ).toBe('/adobe/assets/collections/search');
  });

  it('skips known non-ID segments: contentai', () => {
    expect(decodePathIds('/adobe/assets/contentai/search', ALPHABET), 'contentai segment should not be decoded').toBe(
      '/adobe/assets/contentai/search',
    );
  });

  it('skips known non-ID segments: archives', () => {
    expect(decodePathIds('/adobe/assets/archives', ALPHABET), 'archives segment should not be decoded').toBe(
      '/adobe/assets/archives',
    );
  });

  it('skips known non-ID segments: search', () => {
    expect(decodePathIds('/adobe/assets/search', ALPHABET), 'search segment should not be decoded').toBe(
      '/adobe/assets/search',
    );
  });

  it('returns the path unchanged when no asset segment present', () => {
    expect(decodePathIds('/some/other/path', ALPHABET), 'non-asset paths should pass through unchanged').toBe(
      '/some/other/path',
    );
  });

  it('returns path unchanged when token does not decode to a 4-number UUID', () => {
    expect(
      decodePathIds('/adobe/assets/notAToken', ALPHABET),
      'non-decodable segment should pass through unchanged',
    ).toBe('/adobe/assets/notAToken');
  });
});

describe('replaceMatchTextWithAssetTerm', () => {
  const decode = (s) => (s === ASSET_TOKEN ? ASSET_URN : null);

  it('replaces a match.text token in a flat query array', () => {
    const query = [{ match: { text: ASSET_TOKEN, mode: 'FULLTEXT' } }];
    replaceMatchTextWithAssetTerm(query, decode);
    expect(query, 'should replace match clause with term.assetId clause').toEqual([{ term: { assetId: [ASSET_URN] } }]);
  });

  it('leaves a match.text clause unchanged when token does not decode', () => {
    const query = [{ match: { text: 'plain text search', mode: 'FULLTEXT' } }];
    const original = JSON.stringify(query);
    replaceMatchTextWithAssetTerm(query, decode);
    expect(JSON.stringify(query), 'non-token match.text should not be modified').toBe(original);
  });

  it('replaces a token nested inside an and clause', () => {
    const query = [{ and: [{ match: { text: ASSET_TOKEN } }] }];
    replaceMatchTextWithAssetTerm(query, decode);
    expect(query[0].and, 'should replace token inside nested and clause').toEqual([{ term: { assetId: [ASSET_URN] } }]);
  });

  it('handles multiple match clauses in the same array', () => {
    const query = [{ match: { text: ASSET_TOKEN } }, { match: { text: 'plain text' } }];
    replaceMatchTextWithAssetTerm(query, decode);
    expect(query[0], 'first clause with valid token should be replaced').toEqual({
      term: { assetId: [ASSET_URN] },
    });
    expect(query[1], 'second clause without valid token should be unchanged').toEqual({
      match: { text: 'plain text' },
    });
  });

  it('returns non-array, non-object values unchanged', () => {
    expect(replaceMatchTextWithAssetTerm('string', decode), 'strings should pass through').toBe('string');
    expect(replaceMatchTextWithAssetTerm(42, decode), 'numbers should pass through').toBe(42);
    expect(replaceMatchTextWithAssetTerm(null, decode), 'null should pass through').toBeNull();
  });

  it('walks plain objects recursively', () => {
    const body = { query: [{ match: { text: ASSET_TOKEN } }] };
    replaceMatchTextWithAssetTerm(body, decode);
    expect(body.query, 'should recurse into plain object values').toEqual([{ term: { assetId: [ASSET_URN] } }]);
  });
});
