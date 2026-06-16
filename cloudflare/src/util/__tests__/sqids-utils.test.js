import Sqids from 'sqids';
import { describe, expect, it } from 'vitest';
import { decodeToAssetUrn, decodeToUuid, encodeId } from '../sqids-utils.js';

const ALPHABET = '8gGQeDOJsS069Pod4mU2BKWRXjpiThLkZEHCantwuV7IrcqfAzMbN3vx1YlF5y';
const UUID = '00176f8d-89dc-4175-a96e-bf4ea218b2bc';
const ASSET_URN = `urn:aaid:aem:${UUID}`;

describe('encodeId', () => {
  it('encodes asset URN to a short token', () => {
    const token = encodeId(ASSET_URN, ALPHABET);
    expect(token, 'token should differ from input').not.toBe(ASSET_URN);
    expect(token.length).toBeGreaterThan(0);
  });

  it('encodes bare UUID (no URN prefix)', () => {
    const token = encodeId(UUID, ALPHABET);
    expect(token, 'token should differ from bare UUID').not.toBe(UUID);
  });

  it('is stable — same input always produces same token', () => {
    expect(encodeId(ASSET_URN, ALPHABET)).toBe(encodeId(ASSET_URN, ALPHABET));
  });

  it('returns original value unchanged for non-UUID input', () => {
    expect(encodeId('not-a-uuid', ALPHABET)).toBe('not-a-uuid');
    expect(encodeId('hello world', ALPHABET)).toBe('hello world');
    expect(encodeId('', ALPHABET)).toBe('');
  });

  it('returns original value for non-hex UUID (invalid chars)', () => {
    const badUuid = 'ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ';
    expect(encodeId(badUuid, ALPHABET)).toBe(badUuid);
  });
});

describe('decodeToAssetUrn', () => {
  it('round-trips asset URN encode → decode', () => {
    const token = encodeId(ASSET_URN, ALPHABET);
    expect(decodeToAssetUrn(token, ALPHABET)).toBe(ASSET_URN);
  });

  it('round-trips bare UUID encode → decode (result has URN prefix)', () => {
    const token = encodeId(UUID, ALPHABET);
    expect(decodeToAssetUrn(token, ALPHABET)).toBe(ASSET_URN);
  });

  it('returns null for real URN (hyphens/colons not in alphabet)', () => {
    expect(decodeToAssetUrn(ASSET_URN, ALPHABET)).toBeNull();
  });

  it('returns null for bare UUID (hyphens not in alphabet)', () => {
    expect(decodeToAssetUrn(UUID, ALPHABET)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeToAssetUrn('', ALPHABET)).toBeNull();
  });
});

describe('decodeToUuid', () => {
  it('decodes valid token to bare UUID', () => {
    const token = encodeId(UUID, ALPHABET);
    expect(decodeToUuid(token, ALPHABET)).toBe(UUID);
  });

  it('returns null for strings with characters outside the alphabet', () => {
    expect(decodeToUuid(ASSET_URN, ALPHABET)).toBeNull(); // colons, hyphens not in alphabet
    expect(decodeToUuid('', ALPHABET)).toBeNull();
  });

  it('returns null when any decoded number exceeds uint32 max', () => {
    const craftedToken = new Sqids({ alphabet: ALPHABET }).encode([0, 0, 0, 0x100000000]);
    expect(decodeToUuid(craftedToken, ALPHABET)).toBeNull();
  });
});
