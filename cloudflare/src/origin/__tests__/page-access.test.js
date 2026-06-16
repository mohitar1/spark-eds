import { describe, it, expect } from 'vitest';
import { parsePageExclusions, isUserExcluded } from '../page-access.js';

describe('parsePageExclusions', () => {
  it('returns empty exclusions when no meta tag exists', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: [], bottlerCountries: [], allBottlers: false });
  });

  it('parses a single role exclusion', () => {
    const html = '<html><head><meta name="exclude-roles" content="agency"></head></html>';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: ['agency'], bottlerCountries: [], allBottlers: false });
  });

  it('parses multiple role exclusions', () => {
    const html = '<meta name="exclude-roles" content="agency, contingent-worker">';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: ['agency', 'contingent-worker'], bottlerCountries: [], allBottlers: false });
  });

  it('parses bottler without country as allBottlers', () => {
    const html = '<meta name="exclude-roles" content="bottler">';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: [], bottlerCountries: [], allBottlers: true });
  });

  it('parses country-specific bottler exclusions', () => {
    const html = '<meta name="exclude-roles" content="bottler:us, bottler:ca">';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: [], bottlerCountries: ['us', 'ca'], allBottlers: false });
  });

  it('parses mixed exclusions (roles + bottler countries)', () => {
    const html = '<meta name="exclude-roles" content="agency, bottler:us, bottler:ca">';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: ['agency'], bottlerCountries: ['us', 'ca'], allBottlers: false });
  });

  it('handles empty content attribute', () => {
    const html = '<meta name="exclude-roles" content="">';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: [], bottlerCountries: [], allBottlers: false });
  });

  it('normalizes values to lowercase', () => {
    const html = '<meta name="exclude-roles" content="Agency, Bottler:US">';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: ['agency'], bottlerCountries: ['us'], allBottlers: false });
  });

  it('handles extra whitespace', () => {
    const html = '<meta name="exclude-roles" content="  agency ,  bottler:us  ">';
    const result = parsePageExclusions(html);
    expect(result).toEqual({ roles: ['agency'], bottlerCountries: ['us'], allBottlers: false });
  });
});

describe('isUserExcluded', () => {
  const noExclusions = { roles: [], bottlerCountries: [], allBottlers: false };

  it('returns false for admin users regardless of exclusions', () => {
    const user = { roles: ['admin', 'agency'] };
    const exclusions = { roles: ['agency'], bottlerCountries: [], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(false);
  });

  it('returns false when there are no exclusions', () => {
    const user = { roles: ['employee'] };
    expect(isUserExcluded(user, noExclusions)).toBe(false);
  });

  it('excludes user by role', () => {
    const user = { roles: ['agency'] };
    const exclusions = { roles: ['agency'], bottlerCountries: [], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(true);
  });

  it('does not exclude user with different role', () => {
    const user = { roles: ['employee'] };
    const exclusions = { roles: ['agency'], bottlerCountries: [], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(false);
  });

  it('excludes user if any of their roles matches', () => {
    const user = { roles: ['employee', 'agency'] };
    const exclusions = { roles: ['agency'], bottlerCountries: [], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(true);
  });

  it('excludes all bottlers when allBottlers is true', () => {
    const user = { roles: ['bottler'], countries: ['mx'] };
    const exclusions = { roles: [], bottlerCountries: [], allBottlers: true };
    expect(isUserExcluded(user, exclusions)).toBe(true);
  });

  it('excludes bottler from matching country', () => {
    const user = { roles: ['bottler'], countries: ['us'] };
    const exclusions = { roles: [], bottlerCountries: ['us', 'ca'], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(true);
  });

  it('does not exclude bottler from non-matching country', () => {
    const user = { roles: ['bottler'], countries: ['mx'] };
    const exclusions = { roles: [], bottlerCountries: ['us', 'ca'], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(false);
  });

  it('excludes bottler if any of their countries matches', () => {
    const user = { roles: ['bottler'], countries: ['mx', 'us'] };
    const exclusions = { roles: [], bottlerCountries: ['us'], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(true);
  });

  it('does not exclude non-bottler user by bottler country exclusions', () => {
    const user = { roles: ['employee'], countries: ['us'] };
    const exclusions = { roles: [], bottlerCountries: ['us'], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(false);
  });

  it('handles user with no roles', () => {
    const user = { roles: [] };
    const exclusions = { roles: ['agency'], bottlerCountries: [], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(false);
  });

  it('handles user with undefined roles', () => {
    const user = {};
    const exclusions = { roles: ['agency'], bottlerCountries: [], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(false);
  });

  it('handles bottler with undefined countries', () => {
    const user = { roles: ['bottler'] };
    const exclusions = { roles: [], bottlerCountries: ['us'], allBottlers: false };
    expect(isUserExcluded(user, exclusions)).toBe(false);
  });

  it('handles combined role + bottler country exclusion', () => {
    const agencyUser = { roles: ['agency'] };
    const usBottler = { roles: ['bottler'], countries: ['us'] };
    const mxBottler = { roles: ['bottler'], countries: ['mx'] };
    const employee = { roles: ['employee'] };

    const exclusions = { roles: ['agency'], bottlerCountries: ['us'], allBottlers: false };

    expect(isUserExcluded(agencyUser, exclusions)).toBe(true);
    expect(isUserExcluded(usBottler, exclusions)).toBe(true);
    expect(isUserExcluded(mxBottler, exclusions)).toBe(false);
    expect(isUserExcluded(employee, exclusions)).toBe(false);
  });
});
