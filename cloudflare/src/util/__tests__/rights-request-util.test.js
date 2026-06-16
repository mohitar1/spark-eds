/**
 * Tests for rights-request-util.js: key builders, URLs, permissions,
 * formatDateToGMT, formatAssetDetailsForEmail, transformReactToJCR,
 * status reminders KV, and createUsageRightsReminders.
 */

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  statusReminderKey,
  STATUS_REMINDER_TTL_SECONDS,
  formatAssetDetailsForEmail,
  buildRightsRequestUrls,
  buildRequestKey,
  buildUnassignedReviewKey,
  buildReviewKey,
  buildRequestListPrefix,
  PERMISSIONS,
  isAuthorized,
  hasManageRightsPermission,
  hasAdminRightsPermission,
  formatDateToGMT,
  putStatusReminder,
  deleteStatusReminder,
  transformReactToJCR,
  updateRequestStatusHelper,
  createUsageRightsReminders,
} from '../rights-request-util.js';

describe('rights-request-util', () => {
  describe('statusReminderKey', () => {
    it('returns key with requestId', () => {
      expect(statusReminderKey('req-123')).toBe('status-reminder:req-123');
      expect(statusReminderKey('')).toBe('status-reminder:');
    });
  });

  describe('STATUS_REMINDER_TTL_SECONDS', () => {
    it('is 30 days in seconds', () => {
      expect(STATUS_REMINDER_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    });
  });

  const testOrigin = 'https://example.com';

  describe('formatAssetDetailsForEmail', () => {
    it('returns empty string for non-array or empty', () => {
      expect(formatAssetDetailsForEmail(testOrigin, null)).toBe('');
      expect(formatAssetDetailsForEmail(testOrigin, undefined)).toBe('');
      expect(formatAssetDetailsForEmail(testOrigin, [])).toBe('');
      expect(formatAssetDetailsForEmail(testOrigin, 'not-array')).toBe('');
    });

    it('returns li items using title or name', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [
        { name: 'Asset One' },
        { title: 'Asset Two' },
        { name: 'Asset Three' },
      ]);
      expect(html).toContain('<li>Asset One</li>');
      expect(html).toContain('<li>Asset Two</li>');
      expect(html).toContain('<li>Asset Three</li>');
    });

    it('prefers title over name', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [
        { name: 'Name Only', title: 'Title Wins' },
      ]);
      expect(html).toContain('Title Wins');
      expect(html).not.toContain('Name Only');
    });

    it('returns hyperlinks with red style when asset has assetId', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [
        { name: 'Linked Asset', assetId: 'uuid-123' },
      ]);
      expect(html).toContain(`<a href="${testOrigin}/en/asset-details?assetid=uuid-123"`);
      expect(html).toContain('color: red');
      expect(html).toContain('>Linked Asset</a>');
    });

    it('strips urn prefix from assetId in hyperlink', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [
        { name: 'URN Asset', assetId: 'urn:aaid:aem:uuid-456' },
      ]);
      expect(html).toContain('assetid=uuid-456');
      expect(html).not.toContain('assetid=urn%3Aaaid%3Aaem%3Auuid-456');
    });

    it('returns plain li when asset has no assetId', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [
        { title: 'Detail Link', name: 'Detail Name' },
      ]);
      expect(html).toContain('<li>Detail Link</li>');
      expect(html).not.toContain('<a href');
    });

    it('uses defaultName when title and name are missing', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [{}], 'Fallback');
      expect(html).toBe('<li>Fallback</li>');
    });

    it('escapes HTML in names', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [
        { name: '<script>alert(1)</script>' },
      ]);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('encodes assetId in link href', () => {
      const html = formatAssetDetailsForEmail(testOrigin, [
        { name: 'Safe', assetId: 'id-with&special=chars' },
      ]);
      expect(html).toContain('assetid=id-with%26special%3Dchars');
      expect(html).toContain('>Safe</a>');
    });
  });

  describe('buildRightsRequestUrls', () => {
    it('builds URLs from origin without trailing slash', () => {
      const base = 'https://example.com';
      const urls = buildRightsRequestUrls(base);
      expect(urls.requestDetailsUrl).toBe('https://example.com/en/my-dam/my-rights-review-details');
      expect(urls.myReviewsUrl).toBe('https://example.com/en/my-dam/my-rights-reviews');
      expect(urls.myRequestsUrl).toBe('https://example.com/en/my-dam/my-rights-requests');
    });

    it('strips trailing slash from origin', () => {
      const urls = buildRightsRequestUrls('https://example.com/');
      expect(urls.requestDetailsUrl).toBe('https://example.com/en/my-dam/my-rights-review-details');
    });

    it('appends requestId to requestDetailsUrl when provided', () => {
      const urls = buildRightsRequestUrls('https://example.com', 'req-456');
      expect(urls.requestDetailsUrl).toBe('https://example.com/en/my-dam/my-rights-review-details?requestId=req-456');
    });
  });

  describe('buildRequestKey', () => {
    it('returns user:email:rights-request:requestId', () => {
      expect(buildRequestKey('a@b.com', 'req-1')).toBe('user:a@b.com:rights-request:req-1');
    });
  });

  describe('buildUnassignedReviewKey', () => {
    it('returns unassigned review key', () => {
      expect(buildUnassignedReviewKey('req-2')).toBe('user:unassigned:rights-request-review:req-2');
    });
  });

  describe('buildReviewKey', () => {
    it('returns reviewer email and requestId', () => {
      expect(buildReviewKey('reviewer@b.com', 'req-3')).toBe('user:reviewer@b.com:rights-request-review:req-3');
    });
  });

  describe('buildRequestListPrefix', () => {
    it('returns prefix for listing requests by user', () => {
      expect(buildRequestListPrefix('u@c.com')).toBe('user:u@c.com:rights-request:');
    });
  });

  describe('PERMISSIONS', () => {
    it('defines manage-rights, admin-rights, admin-reports, admin-system', () => {
      expect(PERMISSIONS.MANAGE_RIGHTS).toBe('manage-rights');
      expect(PERMISSIONS.ADMIN_RIGHTS).toBe('admin-rights');
      expect(PERMISSIONS.ADMIN_REPORTS).toBe('admin-reports');
      expect(PERMISSIONS.ADMIN_SYSTEM).toBe('admin-system');
    });
  });

  describe('isAuthorized', () => {
    it('returns true when user has required permission', () => {
      expect(isAuthorized({ permissions: ['manage-rights'] }, 'manage-rights')).toBe(true);
      expect(isAuthorized({ permissions: ['a', 'admin-rights'] }, 'admin-rights')).toBe(true);
    });

    it('returns false when user lacks permission', () => {
      expect(isAuthorized({ permissions: ['other'] }, 'manage-rights')).toBe(false);
      expect(isAuthorized({}, 'manage-rights')).toBeFalsy();
      expect(isAuthorized(null, 'manage-rights')).toBeFalsy();
      expect(isAuthorized({ permissions: null }, 'manage-rights')).toBeFalsy();
    });
  });

  describe('hasManageRightsPermission', () => {
    it('returns true for manage-rights, admin-rights, or sudo', () => {
      expect(hasManageRightsPermission({ permissions: ['manage-rights'] })).toBe(true);
      expect(hasManageRightsPermission({ permissions: ['admin-rights'] })).toBe(true);
      expect(hasManageRightsPermission({ permissions: ['sudo'] })).toBe(true);
      expect(hasManageRightsPermission({ permissions: ['admin-rights', 'other'] })).toBe(true);
      expect(hasManageRightsPermission({ permissions: ['sudo', 'other'] })).toBe(true);
    });

    it('returns false otherwise', () => {
      expect(hasManageRightsPermission({ permissions: ['admin-reports'] })).toBe(false);
      expect(hasManageRightsPermission({})).toBeFalsy();
    });
  });

  describe('hasAdminRightsPermission', () => {
    it('returns true for admin-rights or sudo', () => {
      expect(hasAdminRightsPermission({ permissions: ['admin-rights'] })).toBe(true);
      expect(hasAdminRightsPermission({ permissions: ['sudo'] })).toBe(true);
      expect(hasAdminRightsPermission({ permissions: ['sudo', 'other'] })).toBe(true);
    });

    it('returns false for manage-rights only', () => {
      expect(hasAdminRightsPermission({ permissions: ['manage-rights'] })).toBe(false);
      expect(hasAdminRightsPermission({})).toBeFalsy();
    });
  });

  describe('formatDateToGMT', () => {
    it('returns empty string for null/undefined', () => {
      expect(formatDateToGMT(null)).toBe('');
      expect(formatDateToGMT(undefined)).toBe('');
    });

    it('formats Date to GMT string with GMT+0000', () => {
      const d = new Date('2026-01-05T12:00:00Z');
      const result = formatDateToGMT(d);
      expect(result).toContain('GMT+0000');
      expect(result).toContain('2026');
    });

    it('formats ISO string', () => {
      const result = formatDateToGMT('2026-06-15T00:00:00Z');
      expect(result).toContain('GMT+0000');
      expect(result).toContain('2026');
    });

    it('formats timestamp number', () => {
      const result = formatDateToGMT(new Date('2026-01-01').getTime());
      expect(result).toContain('GMT+0000');
    });

    it('returns empty for invalid date', () => {
      expect(formatDateToGMT('not-a-date')).toBe('');
      expect(formatDateToGMT(NaN)).toBe('');
    });

    it('formats object with year, month, day', () => {
      const result = formatDateToGMT({ year: 2026, month: 1, day: 15 });
      expect(result).toContain('GMT+0000');
      expect(result).toContain('2026');
    });
  });

  describe('putStatusReminder', () => {
    const requestId = 'test-put-status-reminder';

    beforeEach(async () => {
      await env.RIGHTS_REQUEST_REMINDERS.delete(statusReminderKey(requestId));
    });

    it('writes reminder payload to KV', async () => {
      await putStatusReminder(env, requestId, {
        status: 'In Progress',
        rightsRequestStatusChangedAt: '2026-01-01T00:00:00Z',
        reviewerEmail: 'r@example.com',
      });
      const raw = await env.RIGHTS_REQUEST_REMINDERS.get(statusReminderKey(requestId));
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw);
      expect(data.requestId).toBe(requestId);
      expect(data.status).toBe('In Progress');
      expect(data.rightsRequestStatusChangedAt).toBe('2026-01-01T00:00:00Z');
      expect(data.reviewerEmail).toBe('r@example.com');
    });

    it('preserves lastSentAt when not provided and existing entry exists', async () => {
      const existing = {
        requestId,
        status: 'Not Started',
        rightsRequestStatusChangedAt: '2025-12-01T00:00:00Z',
        reviewerEmail: '',
        lastSentAt: '2025-12-15T10:00:00Z',
      };
      await env.RIGHTS_REQUEST_REMINDERS.put(statusReminderKey(requestId), JSON.stringify(existing), {
        expirationTtl: 60,
      });
      await putStatusReminder(env, requestId, {
        status: 'In Progress',
        rightsRequestStatusChangedAt: '2026-01-01T00:00:00Z',
        reviewerEmail: 'r@example.com',
      });
      const raw = await env.RIGHTS_REQUEST_REMINDERS.get(statusReminderKey(requestId));
      const data = JSON.parse(raw);
      expect(data.lastSentAt).toBe('2025-12-15T10:00:00Z');
    });
  });

  describe('deleteStatusReminder', () => {
    const requestId = 'test-delete-status-reminder';

    it('removes reminder from KV', async () => {
      await env.RIGHTS_REQUEST_REMINDERS.put(statusReminderKey(requestId), JSON.stringify({ requestId }), {
        expirationTtl: 60,
      });
      await deleteStatusReminder(env, requestId);
      const raw = await env.RIGHTS_REQUEST_REMINDERS.get(statusReminderKey(requestId));
      expect(raw).toBeNull();
    });
  });

  describe('transformReactToJCR', () => {
    it('returns object with rightsRequestID, rightsRequestDetails, rightsRequestReviewDetails', () => {
      const payload = {
        agencyName: 'Agency',
        restrictedAssets: [{ name: 'A1', assetId: 'id1' }],
        airDate: '2026-01-01',
        pullDate: '2026-12-31',
        selectedMarkets: [{ name: 'US', id: 1 }],
        selectedMediaChannels: [{ name: 'Digital', id: 2 }],
        agencyType: 'Agency',
        contactName: 'Contact',
        contactEmail: 'c@example.com',
        contactPhone: '555',
        materialsRequiredDate: '2026-02-01',
        formatsRequired: 'HD',
        usageRightsRequired: { music: true, talent: false },
        adaptationIntention: 'None',
        budgetForMarket: 'Yes',
        exceptionOrNotes: 'No',
      };
      const result = transformReactToJCR(payload, 'user@example.com');
      expect(result).toHaveProperty('rightsRequestID');
      expect(typeof result.rightsRequestID).toBe('string');
      expect(result.rightsRequestSubmittedUserID).toBe('user@example.com');
      expect(result.rightsRequestDetails).toBeDefined();
      expect(result.rightsRequestDetails.name).toBe('Agency');
      expect(result.rightsRequestDetails.general.assets).toEqual([{ name: 'A1', assetId: 'id1' }]);
      expect(result.rightsRequestReviewDetails.rightsRequestStatus).toBe('Not Started');
      expect(result.rightsRequestReviewDetails.rightsReviewer).toBe('');
    });

    it('maps request title from tcccClientName for Agency submissions', () => {
      const payload = {
        agencyType: 'Agency',
        agencyName: '',
        tcccClientName: 'Agency Client Name',
      };

      const result = transformReactToJCR(payload, 'user@example.com');
      expect(result.rightsRequestDetails.name).toBe('Agency Client Name');
    });

    it('uses contactEmail from payload or falls back to userEmail', () => {
      const payload = { contactEmail: 'other@example.com' };
      const result = transformReactToJCR(payload, 'user@example.com');
      expect(result.rightsRequestDetails.associateAgency.emailAddress).toBe('other@example.com');
    });

    it('includes usageRightsRequired mapping', () => {
      const payload = {
        usageRightsRequired: { music: true, talent: true, photographer: false },
      };
      const result = transformReactToJCR(payload, 'u@e.com');
      expect(result.rightsRequestDetails.materialsNeeded.usageRightsRequired).toContain('Music');
      expect(result.rightsRequestDetails.materialsNeeded.usageRightsRequired).toContain('Talent');
      expect(result.rightsRequestDetails.materialsNeeded.usageRightsRequired).not.toContain('Photographer');
    });
  });

  describe('updateRequestStatusHelper', () => {
    const requestKey = 'user:submitter@example.com:rights-request:req-update';

    beforeEach(async () => {
      await env.RIGHTS_REQUESTS.delete(requestKey);
    });

    it('updates request status and writes to KV', async () => {
      const requestData = {
        rightsRequestID: 'req-update',
        rightsRequestReviewDetails: {
          rightsRequestStatus: 'Not Started',
          rightsRequestStatusChangedAt: null,
        },
        lastModified: '',
        lastModifiedBy: '',
      };
      const updated = await updateRequestStatusHelper(
        env,
        requestKey,
        requestData,
        'In Progress',
        'reviewer@example.com',
      );
      expect(updated.rightsRequestReviewDetails.rightsRequestStatus).toBe('In Progress');
      expect(updated.rightsRequestReviewDetails.rightsRequestStatusChangedAt).toBeDefined();
      expect(updated.lastModifiedBy).toBe('reviewer@example.com');
      const raw = await env.RIGHTS_REQUESTS.get(requestKey);
      expect(raw).toBeTruthy();
      const stored = JSON.parse(raw);
      expect(stored.rightsRequestReviewDetails.rightsRequestStatus).toBe('In Progress');
    });
  });

  describe('createUsageRightsReminders', () => {
    it('returns error when no assets provided', async () => {
      const result = await createUsageRightsReminders(env, null, 'u@e.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No assets provided');
    });

    it('returns error when assets is empty array', async () => {
      const result = await createUsageRightsReminders(env, [], 'u@e.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No assets provided');
    });

    it('skips assets without assetId or pullDate and returns success', async () => {
      const result = await createUsageRightsReminders(env, [{ assetId: 'id1' }], 'u@e.com');
      expect(result.success).toBe(true);
      expect(result.assetsProcessed).toBe(0);
      expect(result.remindersCreated).toBe(0);
    });

    it('creates reminders when asset has valid pullDate in future', async () => {
      const pullDate = new Date();
      pullDate.setDate(pullDate.getDate() + 100);
      const assets = [
        {
          assetId: 'urn:aaid:aem:test-asset-1',
          name: 'Test Asset',
          pullDate: pullDate.toISOString(),
          markets: [{ name: 'US' }],
          mediaChannels: [{ name: 'Digital' }],
        },
      ];
      const result = await createUsageRightsReminders(env, assets, 'user@example.com');
      expect(result.success).toBe(true);
      expect(result.assetsProcessed).toBe(1);
      expect(result.remindersCreated).toBeGreaterThanOrEqual(1);
    });
  });
});
