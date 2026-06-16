/**
 * Unit tests for the My Reviews tab badge label logic.
 *
 * buildMyReviewsLabel depends on the ph() placeholder function, which is
 * initialised during decorate() and bound to the module's closure.  We
 * replicate the pure formatting logic inline here (same pattern used by
 * my-rights-requests/sort-utils.test.js) so the tests have no DOM / fetch
 * dependencies and can run in the standard unit-test Vitest pool.
 */

import {
  describe,
  it,
  expect,
} from 'vitest';

// Inline copy of the pure formatting logic from buildMyReviewsLabel.
// ph() is stubbed with a simple template passthrough so the test stays
// independent of the i18n runtime.
function stubPh(key, fallback) {
  return fallback;
}

function buildMyReviewsLabel(count, partial, phFn = stubPh) {
  return phFn('myReviewsTabLabel', 'My Reviews ({0})')
    .replace('{0}', `${count}${partial ? '+' : ''}`);
}

describe('buildMyReviewsLabel', () => {
  describe('when count is complete (partial = false)', () => {
    it('renders zero count without suffix', () => {
      expect(buildMyReviewsLabel(0, false)).toBe('My Reviews (0)');
    });

    it('renders a positive count without suffix', () => {
      expect(buildMyReviewsLabel(42, false)).toBe('My Reviews (42)');
    });

    it('renders a large count without suffix', () => {
      expect(buildMyReviewsLabel(1000, false)).toBe('My Reviews (1000)');
    });
  });

  describe('when count is partial (partial = true)', () => {
    it('renders zero count with "+" suffix while prefetch is starting', () => {
      expect(buildMyReviewsLabel(0, true)).toBe('My Reviews (0+)');
    });

    it('renders a positive count with "+" suffix while more pages remain', () => {
      expect(buildMyReviewsLabel(100, true)).toBe('My Reviews (100+)');
    });

    it('renders a large partial count with "+" suffix', () => {
      expect(buildMyReviewsLabel(500, true)).toBe('My Reviews (500+)');
    });
  });

  describe('transition from partial to complete', () => {
    it('badge updates correctly from N+ to N when prefetch finishes', () => {
      const partial = buildMyReviewsLabel(200, true);
      const complete = buildMyReviewsLabel(200, false);
      expect(partial).toBe('My Reviews (200+)');
      expect(complete).toBe('My Reviews (200)');
    });
  });

  describe('with a custom ph translation', () => {
    it('uses the translated fallback string when ph returns a different template', () => {
      const frenchPh = () => 'Mes avis ({0})';
      expect(buildMyReviewsLabel(7, false, frenchPh)).toBe('Mes avis (7)');
      expect(buildMyReviewsLabel(7, true, frenchPh)).toBe('Mes avis (7+)');
    });
  });
});
