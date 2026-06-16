import { describe, it, expect } from 'vitest';
import { maskEmail } from '../log-utils.js';

describe('log-utils', () => {
  describe('maskEmail', () => {
    it('masks the local part keeping only the first character and domain', () => {
      expect(maskEmail('john.smith@coca-cola.com')).toBe('j***@coca-cola.com');
    });

    it('works for short local parts (single char)', () => {
      expect(maskEmail('a@b.com')).toBe('a***@b.com');
    });

    it('returns (none) for empty string', () => {
      expect(maskEmail('')).toBe('(none)');
    });

    it('returns (none) for undefined', () => {
      expect(maskEmail(undefined)).toBe('(none)');
    });

    it('returns (none) for null', () => {
      expect(maskEmail(null)).toBe('(none)');
    });

    it('returns *** when email starts with @ (no local part)', () => {
      expect(maskEmail('@nodomain.com')).toBe('***');
    });

    it('preserves the full domain including subdomain', () => {
      expect(maskEmail('user@mail.coca-cola.com')).toBe('u***@mail.coca-cola.com');
    });

    it('handles email with no @ symbol gracefully', () => {
      expect(maskEmail('notanemail')).toBe('***');
    });
  });
});
