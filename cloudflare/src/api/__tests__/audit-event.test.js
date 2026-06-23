import { describe, it, expect } from 'vitest';
import { auditPostEvent } from '../audit.js';
import { encodeId } from '../../util/sqids-utils.js';

const ALPHABET = '8gGQeDOJsS069Pod4mU2BKWRXjpiThLkZEHCantwuV7IrcqfAzMbN3vx1YlF5y';
const URN = 'urn:aaid:aem:00000000-0000-0000-0000-000000000001';
const TOKEN = encodeId(URN, ALPHABET);

function postRequest(user, body) {
  return {
    user, url: 'https://host/api/audit/event', method: 'POST', json: async () => body,
  };
}

// D1 binding that throws if touched — proves the guard short-circuits before INSERT.
const env = {
  SQIDS_ALPHABET: ALPHABET,
  AUDIT_EVENTS: { prepare: () => { throw new Error('D1 should not be queried'); } },
};

describe('auditPostEvent — session guard', () => {
  it('returns 401 when the session has no user id/email (does not hit D1)', async () => {
    const res = await auditPostEvent(postRequest({}, { action: 'view', assetId: TOKEN }), env);
    expect(res.status).toBe(401);
  });

  it('returns 401 when request.user is missing entirely', async () => {
    const res = await auditPostEvent(postRequest(undefined, { action: 'view', assetId: TOKEN }), env);
    expect(res.status).toBe(401);
  });
});
