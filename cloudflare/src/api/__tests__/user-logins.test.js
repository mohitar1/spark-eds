/**
 * Unit tests for user-logins.js
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportUserLoginsCSV, parseName, upsertUserLogin } from '../user-logins.js';

// --- Helpers ---

function mockD1Binding({ results = [], success = true } = {}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success }),
      }),
      all: vi.fn().mockResolvedValue({ results }),
    }),
  };
}

function makeRequest({ method = 'GET', permissions = ['admin-reports'], email = 'test@example.com' } = {}) {
  return {
    method,
    user: { email, permissions },
  };
}

function makeSampleLoginData(overrides = {}) {
  return {
    email: 'john@example.com',
    koid: 'S700855',
    fullName: 'John Smith',
    title: 'Engineer',
    country: 'US',
    employeeType: '10',
    company: 'TCCC',
    roles: ['employee'],
    permissions: ['admin-reports', 'sudo'],
    ...overrides,
  };
}

// --- Tests ---

describe('parseName', () => {
  it('should parse a two-part name correctly', () => {
    const result = parseName('John Smith');
    expect(result).toEqual({
      firstName: 'John',
      lastName: 'Smith',
    });
  });

  it('should handle a single name (mononym)', () => {
    const result = parseName('Madonna');
    expect(result).toEqual({
      firstName: 'Madonna',
      lastName: '',
    });
  });

  it('should handle multi-part last names', () => {
    const result = parseName('Mary Jane Watson');
    expect(result).toEqual({
      firstName: 'Mary',
      lastName: 'Jane Watson',
    });
  });

  it('should handle names with multiple spaces', () => {
    const result = parseName('Jean-Pierre de la Cruz');
    expect(result).toEqual({
      firstName: 'Jean-Pierre',
      lastName: 'de la Cruz',
    });
  });

  it('should handle empty string', () => {
    const result = parseName('');
    expect(result).toEqual({
      firstName: '',
      lastName: '',
    });
  });

  it('should handle null', () => {
    const result = parseName(null);
    expect(result).toEqual({
      firstName: '',
      lastName: '',
    });
  });

  it('should handle undefined', () => {
    const result = parseName(undefined);
    expect(result).toEqual({
      firstName: '',
      lastName: '',
    });
  });

  it('should trim whitespace', () => {
    const result = parseName('  John   Smith  ');
    expect(result).toEqual({
      firstName: 'John',
      lastName: 'Smith',
    });
  });

  it('should handle names with only whitespace', () => {
    const result = parseName('   ');
    expect(result).toEqual({
      firstName: '',
      lastName: '',
    });
  });
});

describe('upsertUserLogin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should gracefully return when USER_LOGINS binding is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await upsertUserLogin({}, makeSampleLoginData());
    expect(warnSpy).toHaveBeenCalledWith('[User Logins] USER_LOGINS D1 binding not available');
  });

  it('should prepare and run the upsert SQL with correct bindings', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding();
    const env = { USER_LOGINS: d1 };

    await upsertUserLogin(env, makeSampleLoginData());

    // prepare was called with an INSERT INTO user_logins SQL
    expect(d1.prepare).toHaveBeenCalledTimes(1);
    const sql = d1.prepare.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO user_logins');
    expect(sql).toContain('ON CONFLICT(email) DO UPDATE SET');

    // bind was called with the correct number of parameters (14)
    const bindCall = d1.prepare().bind;
    expect(bindCall).toHaveBeenCalledTimes(1);
    const bindArgs = bindCall.mock.calls[0];
    expect(bindArgs).toHaveLength(14);
    expect(bindArgs[0]).toBe('john@example.com'); // email
    expect(bindArgs[1]).toBe('S700855'); // koid

    expect(infoSpy).toHaveBeenCalled();
  });

  it('should convert role and permission arrays to pipe-delimited strings', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding();
    const env = { USER_LOGINS: d1 };

    await upsertUserLogin(
      env,
      makeSampleLoginData({
        roles: ['employee', 'bottler'],
        permissions: ['admin-reports', 'sudo', 'manage-rights'],
      }),
    );

    const bindArgs = d1.prepare().bind.mock.calls[0];
    expect(bindArgs[9]).toBe('employee|bottler'); // rolesStr
    expect(bindArgs[10]).toBe('admin-reports|sudo|manage-rights'); // permissionsStr
  });

  it('should handle string roles/permissions (non-array)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding();
    const env = { USER_LOGINS: d1 };

    await upsertUserLogin(
      env,
      makeSampleLoginData({
        roles: 'employee',
        permissions: 'admin-reports',
      }),
    );

    const bindArgs = d1.prepare().bind.mock.calls[0];
    expect(bindArgs[9]).toBe('employee');
    expect(bindArgs[10]).toBe('admin-reports');
  });

  it('should handle null/undefined optional fields gracefully', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding();
    const env = { USER_LOGINS: d1 };

    await upsertUserLogin(env, {
      email: 'minimal@example.com',
      koid: undefined,
      fullName: null,
      title: undefined,
      country: undefined,
      employeeType: undefined,
      company: undefined,
      roles: undefined,
      permissions: undefined,
    });

    const bindArgs = d1.prepare().bind.mock.calls[0];
    expect(bindArgs[0]).toBe('minimal@example.com');
    expect(bindArgs[1]).toBe(''); // koid fallback
    expect(bindArgs[2]).toBe(''); // fullName fallback
    expect(bindArgs[5]).toBe(''); // title fallback
    expect(bindArgs[9]).toBe(''); // roles fallback
    expect(bindArgs[10]).toBe(''); // permissions fallback
  });

  it('should not throw when D1 query fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d1 = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockRejectedValue(new Error('D1 is down')),
        }),
      }),
    };
    const env = { USER_LOGINS: d1 };

    // Should not throw
    await upsertUserLogin(env, makeSampleLoginData());

    expect(errorSpy).toHaveBeenCalledWith('[User Logins] Error upserting login:', 'D1 is down', expect.any(String));
  });
});

describe('exportUserLoginsCSV', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const result = await exportUserLoginsCSV(makeRequest({ method: 'POST' }), {});
    expect(result.status).toBe(405);
  });

  it('should return 403 when user has no permissions', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await exportUserLoginsCSV(makeRequest({ permissions: [] }), {});
    expect(result.status).toBe(403);
  });

  it('should return 403 when user lacks admin-reports permission', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await exportUserLoginsCSV(makeRequest({ permissions: ['sudo'] }), {});
    expect(result.status).toBe(403);
  });

  it('should return 403 when request.user is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await exportUserLoginsCSV({ method: 'GET' }, {});
    expect(result.status).toBe(403);
  });

  it('should return 500 when USER_LOGINS binding is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await exportUserLoginsCSV(makeRequest(), {});
    expect(result.status).toBe(500);
  });

  it('should return CSV with correct headers and content-type', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding({ results: [] });
    const env = { USER_LOGINS: d1 };

    const result = await exportUserLoginsCSV(makeRequest(), env);

    expect(result.status).toBe(200);
    expect(result.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(result.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="koassets-user-logins-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(result.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('should include header row in CSV output', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding({ results: [] });
    const env = { USER_LOGINS: d1 };

    const result = await exportUserLoginsCSV(makeRequest(), env);
    const body = await result.text();
    const headers = body.split('\n')[0].split(',');

    expect(headers).toEqual([
      'KO ID',
      'Full Name',
      'First Name',
      'Last Name',
      'E-mail Address',
      'Created Date',
      'Last Login Date',
      'profile/country',
      'profile/userType',
      'profile/title',
      'Roles',
      'Permissions',
    ]);
  });

  it('should include user data rows in CSV output', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding({
      results: [
        {
          koid: 'S700855',
          full_name: 'John Smith',
          first_name: 'John',
          last_name: 'Smith',
          email: 'john@example.com',
          first_login_date: '2025-06-15T10:30:00.000Z',
          last_login_date: '2026-02-11T14:00:00.000Z',
          country: 'US',
          employee_type: '10',
          title: 'Engineer',
          roles: 'employee',
          permissions: 'admin-reports|sudo',
        },
      ],
    });
    const env = { USER_LOGINS: d1 };

    const result = await exportUserLoginsCSV(makeRequest(), env);
    const body = await result.text();
    const lines = body.split('\n');

    expect(lines).toHaveLength(2); // header + 1 data row
    // Fields are comma-delimited and quoted
    expect(body).toContain('"S700855"');
    expect(body).toContain('"John Smith"');
    expect(body).toContain('"john@example.com"');
    expect(body).toContain('"US"');
    expect(body).toContain('"admin-reports|sudo"');
  });

  it('should escape CSV fields containing quotes', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const d1 = mockD1Binding({
      results: [
        {
          koid: '',
          full_name: 'Name "Nickname" Last',
          first_name: 'Name',
          last_name: 'Last',
          email: 'test@example.com',
          first_login_date: '2025-01-01T00:00:00Z',
          last_login_date: '2025-01-01T00:00:00Z',
          country: '',
          employee_type: '',
          title: '',
          roles: '',
          permissions: '',
        },
      ],
    });
    const env = { USER_LOGINS: d1 };

    const result = await exportUserLoginsCSV(makeRequest(), env);
    const body = await result.text();

    // Quotes inside fields should be doubled per RFC 4180
    expect(body).toContain('"Name ""Nickname"" Last"');
  });

  it('should return 500 when D1 query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d1 = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockRejectedValue(new Error('D1 query failed')),
      }),
    };
    const env = { USER_LOGINS: d1 };

    const result = await exportUserLoginsCSV(makeRequest(), env);
    expect(result.status).toBe(500);
  });
});
