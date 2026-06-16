/**
 * Analytics & data freshness tests.
 *
 * 1. Analytics Engine events — queries report-metrics for each of the three
 *    event types (login, search, download) and asserts events exist in the
 *    last 7 days and last 24 hours.
 * 2. User logins CSV (D1) — downloads the CSV export and checks that at
 *    least one user has a "Last Login Date" within the same windows.
 * 3. Raw download events — fetches the current-month raw downloads CSV and
 *    validates that any publicationId values present are bare UUIDs, not
 *    DAM paths (guards against regression where /content/dam/... paths were
 *    stored instead of stripped asset IDs).
 *
 * A failure here is an early signal that analytics writes or D1 upserts
 * may have broken (e.g. after a search migration to ContentAI).
 */

/* eslint-disable no-restricted-syntax, no-continue */
import {
  describe, it, expect, beforeAll,
} from 'vitest';
import { makeRequest } from './setup/auth.js';
import { getBaseUrl, getCurrentEnv } from './setup/env.js';

const cookie = process.env.TEST_SESSION_COOKIE;

const now = new Date();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);
const today = now.toISOString().slice(0, 10);
const weekStart = sevenDaysAgo.toISOString().slice(0, 10);
const dayStart = oneDayAgo.toISOString().slice(0, 10);

function sumColumn(rows, col) {
  return (rows || []).reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
}

async function queryMetric(type, startDate, endDate) {
  const res = await makeRequest('/api/analytics/report-metrics', {
    method: 'GET',
    query: { type, startDate, endDate },
    redirect: 'manual',
  });

  expect(res.status, `report-metrics?type=${type} returned ${res.status}`).toBe(200);
  expect(res.body?.success, `report-metrics?type=${type} success flag`).toBe(true);
  return res.body?.data ?? [];
}

/**
 * Split a CSV line into fields, respecting quoted values (RFC 4180).
 * Handles double-quote escaping ("") inside quoted fields.
 */
function splitCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse the "Last Login Date" column from the user-logins CSV.
 * Dates are in M/D/YYYY H:MM format (e.g. "2/17/2026 9:04").
 * Returns an array of Date objects for every parseable last-login value.
 */
function parseLastLoginDates(csvText) {
  const lines = csvText.split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const cols = splitCSVLine(lines[0]).map((c) => c.trim());
  const idx = cols.indexOf('Last Login Date');
  if (idx === -1) return [];

  const dates = [];
  for (const line of lines.slice(1)) {
    const fields = splitCSVLine(line);
    const raw = (fields[idx] || '').trim();
    if (!raw) continue;

    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (!m) continue;

    const d = new Date(
      Number(m[3]),
      Number(m[1]) - 1,
      Number(m[2]),
      Number(m[4]),
      Number(m[5]),
    );
    if (!Number.isNaN(d.getTime())) dates.push(d);
  }
  return dates;
}

/** UUID format: bare hex UUID without urn: prefix */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse raw-downloads CSV into an array of row objects keyed by header name.
 * Skips the header row; ignores blank lines.
 */
function parseRawDownloadsCSV(csvText) {
  const lines = csvText.split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    return row;
  });
}

if (!cookie) {
  describe('analytics & data freshness', () => {
    it.skip('requires TEST_SESSION_COOKIE', () => {});
  });
} else {
  const baseUrl = getBaseUrl();
  const env = getCurrentEnv();

  // eslint-disable-next-line no-console
  console.log(`\n  Analytics & data freshness tests → ${baseUrl}  (env: ${env})\n`);

  describe('analytics & data freshness', () => {
    beforeAll(async () => {
      const res = await makeRequest('/api/user', { redirect: 'manual' });
      if (res.status === 302 || res.status === 401 || res.status === 403) {
        throw new Error(
          `Session cookie expired or invalid (GET /api/user → ${res.status}). `
          + 'Get a fresh cookie and re-export TEST_SESSION_COOKIE.',
        );
      }
    });

    /* -------------------------------------------------------------- */
    /*  Analytics Engine events                                        */
    /* -------------------------------------------------------------- */

    const EVENT_CHECKS = [
      { label: 'login', metric: 'loginsByMonth', column: 'logins' },
      { label: 'search', metric: 'searchesByMonth', column: 'searches' },
      { label: 'download', metric: 'downloadsByMonth', column: 'downloads' },
    ];

    describe('analytics engine events', () => {
      describe('last 7 days', () => {
        for (const { label, metric, column } of EVENT_CHECKS) {
          it(`has ${label} events`, async () => {
            const rows = await queryMetric(metric, weekStart, today);
            const total = sumColumn(rows, column);
            expect(
              total,
              `Expected ≥1 ${label} event in last 7 days (${weekStart} – ${today})`,
            ).toBeGreaterThan(0);
          });
        }
      });

      describe('last 24 hours', () => {
        for (const { label, metric, column } of EVENT_CHECKS) {
          it(`has ${label} events`, async () => {
            const rows = await queryMetric(metric, dayStart, today);
            const total = sumColumn(rows, column);
            expect(
              total,
              `Expected ≥1 ${label} event in last 24h (${dayStart} – ${today})`,
            ).toBeGreaterThan(0);
          });
        }
      });
    });

    /* -------------------------------------------------------------- */
    /*  User logins CSV (D1)                                           */
    /* -------------------------------------------------------------- */

    describe('user logins CSV (D1)', () => {
      let loginDates;

      beforeAll(async () => {
        const res = await makeRequest('/api/user-logins/csv', {
          redirect: 'manual',
        });

        if (res.status === 403) {
          throw new Error(
            'GET /api/user-logins/csv returned 403 — session needs '
            + 'admin-reports permission to download the CSV.',
          );
        }
        if (res.status === 500) {
          throw new Error(
            'GET /api/user-logins/csv returned 500 — USER_LOGINS D1 '
            + 'binding may not be configured.',
          );
        }

        expect(res.status, 'CSV endpoint status').toBe(200);

        const csv = typeof res.body === 'string'
          ? res.body
          : JSON.stringify(res.body);
        loginDates = parseLastLoginDates(csv);

        expect(
          loginDates.length,
          'CSV should contain at least one user with a parseable Last Login Date',
        ).toBeGreaterThan(0);
      });

      it('has logins within the last 7 days', () => {
        const recent = loginDates.filter((d) => d >= sevenDaysAgo);
        expect(
          recent.length,
          `Expected ≥1 user with Last Login Date after ${weekStart}`,
        ).toBeGreaterThan(0);
      });

      it('has logins within the last 24 hours', () => {
        const recent = loginDates.filter((d) => d >= oneDayAgo);
        expect(
          recent.length,
          `Expected ≥1 user with Last Login Date after ${dayStart}`,
        ).toBeGreaterThan(0);
      });
    });

    /* -------------------------------------------------------------- */
    /*  Search event — searchType validation                           */
    /* -------------------------------------------------------------- */

    const VALID_SEARCH_TYPES = ['all', 'assets', 'templates', 'products'];

    describe('search event searchType', () => {
      describe('last 7 days', () => {
        it('every searchType is assets, templates, or products', async () => {
          const rows = await queryMetric('searchesByMonth', weekStart, today);
          const invalid = rows.filter((r) => !VALID_SEARCH_TYPES.includes(r.searchType));
          const invalidTypes = [...new Set(invalid.map((r) => r.searchType))];
          expect(
            invalidTypes,
            `Unexpected searchType value(s) in last 7 days: ${invalidTypes.join(', ')}`,
          ).toHaveLength(0);
        });
      });

      describe('last 24 hours', () => {
        it('every searchType is assets, templates, or products', async () => {
          const rows = await queryMetric('searchesByMonth', dayStart, today);
          const invalid = rows.filter((r) => !VALID_SEARCH_TYPES.includes(r.searchType));
          const invalidTypes = [...new Set(invalid.map((r) => r.searchType))];
          expect(
            invalidTypes,
            `Unexpected searchType value(s) in last 24h: ${invalidTypes.join(', ')}`,
          ).toHaveLength(0);
        });
      });
    });

    /* -------------------------------------------------------------- */
    /*  Raw download events — publicationId format validation          */
    /* -------------------------------------------------------------- */

    describe('raw download events — publicationId format', () => {
      let allRows = [];

      beforeAll(async () => {
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // current month keeps the payload small

        const res = await makeRequest('/api/analytics/raw-downloads', {
          redirect: 'manual',
          query: { year, month },
        });

        if (res.status === 403) {
          throw new Error(
            'GET /api/analytics/raw-downloads returned 403 — session needs '
            + 'admin-reports permission.',
          );
        }
        if (res.status === 500) {
          throw new Error(
            'GET /api/analytics/raw-downloads returned 500 — '
            + 'ANALYTICS_API_TOKEN may be expired or misconfigured.',
          );
        }

        expect(res.status, 'raw-downloads status').toBe(200);

        const csv = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
        allRows = parseRawDownloadsCSV(csv);
      });

      describe('last 7 days', () => {
        it('publication IDs are UUIDs, not DAM paths', () => {
          const rows = allRows.filter((r) => new Date(r['Date/Time']) >= sevenDaysAgo);
          const withPubId = rows.filter((r) => r['Publication ID']);

          // If no template downloads occurred in this window, skip gracefully
          if (withPubId.length === 0) return;

          const invalid = withPubId.filter((r) => !UUID_REGEX.test(r['Publication ID']));
          const invalidList = invalid.map((r) => `  "${r['Publication ID']}"`).join('\n');
          expect(
            invalid,
            `Found ${invalid.length} row(s) in last 7 days where Publication ID is not a UUID:\n${invalidList}`,
          ).toHaveLength(0);
        });
      });

      describe('last 24 hours', () => {
        it('publication IDs are UUIDs, not DAM paths', () => {
          const rows = allRows.filter((r) => new Date(r['Date/Time']) >= oneDayAgo);
          const withPubId = rows.filter((r) => r['Publication ID']);

          // If no template downloads occurred in this window, skip gracefully
          if (withPubId.length === 0) return;

          const invalid = withPubId.filter((r) => !UUID_REGEX.test(r['Publication ID']));
          const invalidList = invalid.map((r) => `  "${r['Publication ID']}"`).join('\n');
          expect(
            invalid,
            `Found ${invalid.length} row(s) in last 24h where Publication ID is not a UUID:\n${invalidList}`,
          ).toHaveLength(0);
        });
      });
    });
  });
}
