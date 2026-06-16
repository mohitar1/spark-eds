import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';

const {
  buildUnassignedReviewKeyMock,
  buildReviewKeyMock,
  putStatusReminderMock,
  deleteStatusReminderMock,
  hasManageRightsPermissionMock,
  hasAdminRightsPermissionMock,
  fetchHelixSheetMock,
  sendEmailMock,
  sendMessageMock,
  sendMessageToMultipleMock,
  notifyStatusChangeMock,
  notifyReviewerAssignmentMock,
} = vi.hoisted(() => {
  // Use distinct inner names to avoid no-shadow with the outer destructuring.
  const manageRightsFn = vi.fn(() => true);
  const adminRightsFn = vi.fn(() => true);
  const fetchHelixSheetFn = vi.fn().mockResolvedValue({
    'example.com': { permissions: ['manage-rights'] },
  });
  const sendEmailFn = vi.fn().mockResolvedValue({ success: true });
  const sendMessageFn = vi.fn();
  const sendMessageToMultipleFn = vi.fn();
  const notifyStatusChangeFn = vi.fn(
    (env, ctx, _request, _requestId, _status, requestDataObj) => {
      if (!ctx) return;
      const submitterEmail = requestDataObj?.rightsRequestSubmittedUserID;
      if (!submitterEmail) return;
      sendMessageFn(env, submitterEmail, { subject: 'Rights Request Status Update' });
      sendEmailFn({ to: submitterEmail, template: 'rights-request-status-change' });
    },
  );
  const notifyReviewerAssignmentFn = vi.fn((
    env,
    ctx,
    _request,
    {
      targetEmail,
      submittedBy,
      assignedBy,
      isSelfAssignment,
    },
  ) => {
    if (!ctx || !targetEmail || !submittedBy) return;
    sendMessageFn(env, targetEmail, {
      subject: 'Rights Request Assigned to You',
      message: isSelfAssignment
        ? 'You have assigned this rights request to yourself.'
        : `A rights request has been assigned to you by ${assignedBy}.`,
    });
    sendEmailFn({ to: targetEmail, template: 'rights-request-reviewer-assigned' });
    if (submittedBy !== targetEmail) {
      sendMessageFn(env, submittedBy, { subject: 'Your Rights Request Has Been Assigned' });
    }
  });

  return {
    buildUnassignedReviewKeyMock: vi.fn(
      (requestId) => `user:unassigned:rights-request-review:${requestId}`,
    ),
    buildReviewKeyMock: vi.fn(
      (email, requestId) => `user:${email}:rights-request-review:${requestId}`,
    ),
    putStatusReminderMock: vi.fn().mockResolvedValue(undefined),
    deleteStatusReminderMock: vi.fn().mockResolvedValue(undefined),
    hasManageRightsPermissionMock: manageRightsFn,
    hasAdminRightsPermissionMock: adminRightsFn,
    fetchHelixSheetMock: fetchHelixSheetFn,
    sendEmailMock: sendEmailFn,
    sendMessageMock: sendMessageFn,
    sendMessageToMultipleMock: sendMessageToMultipleFn,
    notifyStatusChangeMock: notifyStatusChangeFn,
    notifyReviewerAssignmentMock: notifyReviewerAssignmentFn,
  };
});

vi.mock('../../email/email-service.js', () => ({
  EmailService: class MockEmailService {
    static send(payload) {
      return sendEmailMock(payload);
    }
  },
}));

vi.mock('../../email/template-loader.js', () => ({
  escapeHtml: vi.fn((value) => String(value || '')),
  formatDate: vi.fn((value) => String(value || '')),
}));

vi.mock('../../util/helixutil.js', () => ({
  fetchHelixSheet: fetchHelixSheetMock,
}));

vi.mock('../../util/notifications-helpers.js', () => ({
  sendMessage: sendMessageMock,
  sendMessageToMultiple: sendMessageToMultipleMock,
}));

vi.mock('../../util/rights-request-util.js', () => ({
  createUsageRightsReminders: vi.fn().mockResolvedValue({
    success: true,
    assetsProcessed: 0,
    remindersCreated: 0,
  }),
  formatAssetDetailsForEmail: vi.fn(() => ''),
  buildRightsRequestUrls: vi.fn(() => ({
    requestDetailsUrl: 'http://test/request',
    myReviewsUrl: 'http://test/reviews',
    myRequestsUrl: 'http://test/requests',
  })),
  buildRequestKey: vi.fn((email, requestId) => `user:${email}:rights-request:${requestId}`),
  buildUnassignedReviewKey: buildUnassignedReviewKeyMock,
  buildReviewKey: buildReviewKeyMock,
  buildRequestListPrefix: vi.fn((email) => `user:${email}:rights-request:`),
  normalizeEmail: vi.fn((value) => String(value || '').trim().toLowerCase()),
  countKvKeys: vi.fn().mockResolvedValue(0),
  ASSOCIATE_AGENCY_PAYLOAD_KEYS: ['name', 'contactName', 'emailAddress', 'phoneNumber', 'agentType'],
  ASSOCIATE_AGENCY_DIRECT_KEYS: ['name', 'contactName', 'emailAddress', 'phoneNumber'],
  putStatusReminder: putStatusReminderMock,
  deleteStatusReminder: deleteStatusReminderMock,
  getRightsReviewers: vi.fn().mockResolvedValue([]),
  transformReactToJCR: vi.fn((payload) => payload),
  updateRequestStatusHelper: vi.fn().mockResolvedValue({}),
  notifyStatusChange: notifyStatusChangeMock,
  notifyReviewerAssignment: notifyReviewerAssignmentMock,
  hasManageRightsPermission: hasManageRightsPermissionMock,
  hasAdminRightsPermission: hasAdminRightsPermissionMock,
  isAuthorized: vi.fn(() => false),
  PERMISSIONS: {
    ADMIN_REPORTS: 'admin-reports',
    MANAGE_RIGHTS: 'manage-rights',
    ADMIN_RIGHTS: 'admin-rights',
  },
}));

// eslint-disable-next-line import/first -- vi.mock() must precede this import for Vitest hoisting
import {
  getReviewEntryAndRequest,
  updateReviewDetails,
  assignReview,
} from '../rightsrequests.js';

function createKvNamespace(initial = {}) {
  const store = new Map();
  Object.entries(initial).forEach(([key, value]) => {
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  });

  return {
    get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({
      keys: Array.from(store.keys()).map((name) => ({ name })),
      list_complete: true,
    })),
    _store: store,
  };
}

function createEnv({ reviews = {}, requests = {} } = {}) {
  return {
    RIGHTS_REQUEST_REVIEWS: createKvNamespace(reviews),
    RIGHTS_REQUESTS: createKvNamespace(requests),
    RIGHTS_REQUEST_REMINDERS: createKvNamespace(),
  };
}

function createRequest(
  body,
  user = { email: 'reviewer@example.com' },
  url = 'https://example.com/api/rightsrequests/reviews/update',
) {
  return {
    user,
    url,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('rightsrequests getReviewEntryAndRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasManageRightsPermissionMock.mockReturnValue(true);
    hasAdminRightsPermissionMock.mockReturnValue(true);
    fetchHelixSheetMock.mockResolvedValue({
      'example.com': { permissions: ['manage-rights'] },
    });
  });

  it('reads unassigned review entry when isUnassigned is true', async () => {
    const requestId = 'REQ-100';
    const unassignedKey = `user:unassigned:rights-request-review:${requestId}`;
    const primaryKey = 'user:submitter@example.com:rights-request:REQ-100';
    const env = createEnv({
      reviews: {
        [unassignedKey]: { requestId: primaryKey, rightsRequestStatus: 'Not Started' },
      },
      requests: {
        [primaryKey]: { rightsRequestID: requestId },
      },
    });

    const result = await getReviewEntryAndRequest(
      requestId,
      'reviewer@example.com',
      env,
      { isUnassigned: true },
    );

    expect(result.reviewStorageKey).toBe(unassignedKey);
    expect(result.requestData.rightsRequestID).toBe(requestId);
    expect(env.RIGHTS_REQUEST_REVIEWS.get).toHaveBeenCalledTimes(1);
    expect(env.RIGHTS_REQUEST_REVIEWS.get).toHaveBeenCalledWith(unassignedKey);
  });

  it('uses reviewerEmail for assigned key and lowercases it', async () => {
    const requestId = 'REQ-101';
    const assignedKey = 'user:assigned@example.com:rights-request-review:REQ-101';
    const primaryKey = 'user:submitter@example.com:rights-request:REQ-101';
    const env = createEnv({
      reviews: {
        [assignedKey]: { requestId: primaryKey, rightsRequestStatus: 'In Progress' },
      },
      requests: {
        [primaryKey]: { rightsRequestID: requestId },
      },
    });

    const result = await getReviewEntryAndRequest(
      requestId,
      'fallback@example.com',
      env,
      { isUnassigned: false, reviewerEmail: ' Assigned@Example.COM ' },
    );

    expect(buildReviewKeyMock).toHaveBeenCalledWith('assigned@example.com', requestId);
    expect(result.reviewStorageKey).toBe(assignedKey);
    expect(env.RIGHTS_REQUEST_REVIEWS.get).toHaveBeenCalledWith(assignedKey);
  });

  it('falls back from assigned key to unassigned key when opts.isUnassigned is not set', async () => {
    const requestId = 'REQ-102';
    const assignedKey = 'user:reviewer@example.com:rights-request-review:REQ-102';
    const unassignedKey = 'user:unassigned:rights-request-review:REQ-102';
    const primaryKey = 'user:submitter@example.com:rights-request:REQ-102';
    const env = createEnv({
      reviews: {
        [unassignedKey]: { requestId: primaryKey, rightsRequestStatus: 'Not Started' },
      },
      requests: {
        [primaryKey]: { rightsRequestID: requestId },
      },
    });

    const result = await getReviewEntryAndRequest(requestId, 'reviewer@example.com', env);

    expect(result.reviewStorageKey).toBe(unassignedKey);
    expect(env.RIGHTS_REQUEST_REVIEWS.get.mock.calls[0][0]).toBe(assignedKey);
    expect(env.RIGHTS_REQUEST_REVIEWS.get.mock.calls[1][0]).toBe(unassignedKey);
  });

  it('returns null when primary request entry is missing', async () => {
    const requestId = 'REQ-103';
    const assignedKey = 'user:reviewer@example.com:rights-request-review:REQ-103';
    const env = createEnv({
      reviews: {
        [assignedKey]: { requestId: 'user:submitter@example.com:rights-request:REQ-103' },
      },
    });

    const result = await getReviewEntryAndRequest(
      requestId,
      'reviewer@example.com',
      env,
      { isUnassigned: false },
    );

    expect(result).toBeNull();
  });
});

describe('rightsrequests updateReviewDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasManageRightsPermissionMock.mockReturnValue(true);
    hasAdminRightsPermissionMock.mockReturnValue(true);
    fetchHelixSheetMock.mockResolvedValue({
      'example.com': { permissions: ['manage-rights'] },
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    const env = createEnv();
    const request = createRequest({ requestId: 'REQ-1' }, {});
    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('User not authenticated');
  });

  it('returns 403 when user lacks manage-rights permission', async () => {
    hasManageRightsPermissionMock.mockReturnValue(false);
    const env = createEnv();
    const request = createRequest({ requestId: 'REQ-1' });
    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Manage-rights permission required');
  });

  it('returns 400 when requestId is missing', async () => {
    const env = createEnv();
    const request = createRequest({});
    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('requestId is required');
  });

  it('returns 404 when review entry is not found', async () => {
    const env = createEnv();
    const request = createRequest({ requestId: 'REQ-404', isUnassigned: true });
    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Review not found');
  });

  it('returns 400 when review status is invalid', async () => {
    const requestId = 'REQ-404A';
    const reviewer = 'assigned@example.com';
    const reviewKey = `user:${reviewer}:rights-request-review:${requestId}`;
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;
    const env = createEnv({
      reviews: {
        [reviewKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'In Progress',
          rightsReviewer: reviewer,
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestDetails: {},
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'In Progress',
            rightsReviewer: reviewer,
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: reviewer,
      rightsRequestStatus: 'Unknown Status',
    }, { email: 'reviewer@example.com' });

    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid status');
    expect(env.RIGHTS_REQUESTS.put).not.toHaveBeenCalled();
    expect(env.RIGHTS_REQUEST_REVIEWS.put).not.toHaveBeenCalled();
  });

  it('returns 403 when reviewer is changed by non-admin user', async () => {
    hasAdminRightsPermissionMock.mockReturnValue(false);
    const requestId = 'REQ-404B';
    const oldReviewer = 'assigned@example.com';
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;
    const reviewKey = `user:${oldReviewer}:rights-request-review:${requestId}`;
    const env = createEnv({
      reviews: {
        [reviewKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'In Progress',
          rightsReviewer: oldReviewer,
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestDetails: {},
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'In Progress',
            rightsReviewer: oldReviewer,
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: oldReviewer,
      rightsReviewer: 'new.reviewer@example.com',
    }, { email: 'reviewer@example.com' });

    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Admin-rights permission required');
    expect(env.RIGHTS_REQUESTS.put).not.toHaveBeenCalled();
    expect(env.RIGHTS_REQUEST_REVIEWS.put).not.toHaveBeenCalled();
  });

  it('returns 400 when new reviewer is not eligible', async () => {
    fetchHelixSheetMock.mockResolvedValue({});
    const requestId = 'REQ-404C';
    const oldReviewer = 'assigned@example.com';
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;
    const reviewKey = `user:${oldReviewer}:rights-request-review:${requestId}`;
    const env = createEnv({
      reviews: {
        [reviewKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'In Progress',
          rightsReviewer: oldReviewer,
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestDetails: {},
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'In Progress',
            rightsReviewer: oldReviewer,
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: oldReviewer,
      rightsReviewer: 'external.user@anotherdomain.com',
    }, { email: 'admin@example.com' });

    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid assignee');
    expect(env.RIGHTS_REQUESTS.put).not.toHaveBeenCalled();
    expect(env.RIGHTS_REQUEST_REVIEWS.put).not.toHaveBeenCalled();
  });

  it('updates request and review data and writes a reminder for remindable status', async () => {
    const requestId = 'REQ-200';
    const reviewKey = `user:unassigned:rights-request-review:${requestId}`;
    const reassignedKey = `user:assigned.reviewer@example.com:rights-request-review:${requestId}`;
    const primaryKey = 'user:submitter@example.com:rights-request:REQ-200';
    const env = createEnv({
      reviews: {
        [reviewKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'Not Started',
          rightsReviewer: '',
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestDetails: {
            associateAgency: {
              name: 'Old Name',
            },
            intendedUsage: {
              marketsCovered: [{ id: 'us', name: 'US' }],
            },
            general: {
              assets: [{ assetId: 'old-asset', name: 'old.png' }],
            },
          },
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'Not Started',
            rightsReviewer: '',
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: true,
      reviewerEmail: ' reviewer@example.com ',
      name: 'New Client Name',
      contactName: 'Contact Person',
      emailAddress: 'client@example.com',
      phoneNumber: '+1 555 0100',
      agentType: 'Agency',
      rightsRequestStatus: 'In Progress',
      rightsReviewer: 'assigned.reviewer@example.com',
      rightsRequestDetails: {
        intendedUsage: {
          mediaRights: [{ id: 'tv', name: 'TV' }],
        },
        general: {
          assets: [{ assetId: 'new-asset', name: 'new.png' }],
        },
      },
    }, { email: 'Reviewer@Example.com' });

    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({ requestId });

    expect(env.RIGHTS_REQUESTS.put).toHaveBeenCalledTimes(1);
    const updatedRequest = JSON.parse(env.RIGHTS_REQUESTS.put.mock.calls[0][1]);
    expect(updatedRequest.rightsRequestDetails.associateAgency).toMatchObject({
      agencyOrTcccAssociate: 'Agency',
      name: 'New Client Name',
      contactName: 'Contact Person',
      emailAddress: 'client@example.com',
      phoneNumber: '+1 555 0100',
    });
    expect(updatedRequest.rightsRequestDetails.intendedUsage).toEqual({
      marketsCovered: [{ id: 'us', name: 'US' }],
      mediaRights: [{ id: 'tv', name: 'TV' }],
    });
    expect(updatedRequest.rightsRequestDetails.general.assets).toEqual([
      { assetId: 'new-asset', name: 'new.png' },
    ]);
    expect(updatedRequest.rightsRequestReviewDetails.rightsRequestStatus).toBe('In Progress');
    expect(updatedRequest.rightsRequestReviewDetails.rightsReviewer).toBe(
      'assigned.reviewer@example.com',
    );
    expect(updatedRequest.lastModifiedBy).toBe('reviewer@example.com');
    expect(typeof updatedRequest.lastModified).toBe('string');

    expect(env.RIGHTS_REQUEST_REVIEWS.put).toHaveBeenCalledTimes(1);
    expect(env.RIGHTS_REQUEST_REVIEWS.put.mock.calls[0][0]).toBe(reassignedKey);
    const updatedReview = JSON.parse(env.RIGHTS_REQUEST_REVIEWS.put.mock.calls[0][1]);
    expect(updatedReview.rightsRequestStatus).toBe('In Progress');
    expect(updatedReview.rightsReviewer).toBe('assigned.reviewer@example.com');
    expect(env.RIGHTS_REQUEST_REVIEWS.delete).toHaveBeenCalledTimes(1);
    expect(env.RIGHTS_REQUEST_REVIEWS.delete).toHaveBeenCalledWith(reviewKey);

    expect(putStatusReminderMock).toHaveBeenCalledTimes(1);
    expect(putStatusReminderMock).toHaveBeenCalledWith(env, requestId, expect.objectContaining({
      status: 'In Progress',
      reviewerEmail: 'reviewer@example.com',
    }));
    expect(deleteStatusReminderMock).not.toHaveBeenCalled();
  });

  it('deletes reminder for non-remindable status and uses assigned key', async () => {
    const requestId = 'REQ-201';
    const assignedKey = 'user:assigned@example.com:rights-request-review:REQ-201';
    const primaryKey = 'user:submitter@example.com:rights-request:REQ-201';
    const env = createEnv({
      reviews: {
        [assignedKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'In Progress',
          rightsReviewer: 'assigned@example.com',
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestDetails: {},
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'In Progress',
            rightsReviewer: 'assigned@example.com',
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: ' Assigned@Example.com ',
      rightsRequestStatus: 'Done',
    });

    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(buildReviewKeyMock).toHaveBeenCalledWith('assigned@example.com', requestId);
    expect(env.RIGHTS_REQUEST_REVIEWS.get).toHaveBeenCalledWith(assignedKey);
    expect(putStatusReminderMock).not.toHaveBeenCalled();
    expect(deleteStatusReminderMock).toHaveBeenCalledTimes(1);
    expect(deleteStatusReminderMock).toHaveBeenCalledWith(env, requestId);
  });

  it('moves review key when reviewer changes from one assignee to another', async () => {
    const requestId = 'REQ-201A';
    const oldReviewer = 'assigned@example.com';
    const newReviewer = 'new.reviewer@example.com';
    const oldKey = `user:${oldReviewer}:rights-request-review:${requestId}`;
    const newKey = `user:${newReviewer}:rights-request-review:${requestId}`;
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;
    const env = createEnv({
      reviews: {
        [oldKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'In Progress',
          rightsReviewer: oldReviewer,
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestDetails: {},
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'In Progress',
            rightsReviewer: oldReviewer,
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: oldReviewer,
      rightsReviewer: ' New.Reviewer@Example.com ',
    });

    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(env.RIGHTS_REQUEST_REVIEWS.put).toHaveBeenCalledTimes(1);
    expect(env.RIGHTS_REQUEST_REVIEWS.put).toHaveBeenCalledWith(
      newKey,
      expect.any(String),
    );
    expect(env.RIGHTS_REQUEST_REVIEWS.delete).toHaveBeenCalledTimes(1);
    expect(env.RIGHTS_REQUEST_REVIEWS.delete).toHaveBeenCalledWith(oldKey);
    expect(buildReviewKeyMock).toHaveBeenCalledWith(newReviewer, requestId);
    const updatedRequest = JSON.parse(env.RIGHTS_REQUESTS.put.mock.calls[0][1]);
    expect(updatedRequest.rightsRequestReviewDetails.rightsReviewer).toBe(newReviewer);
  });

  it('triggers reviewer and status notifications only when values actually change', async () => {
    const requestId = 'REQ-201B';
    const oldReviewer = 'assigned@example.com';
    const newReviewer = 'new.reviewer@example.com';
    const reviewKey = `user:${oldReviewer}:rights-request-review:${requestId}`;
    const newReviewKey = `user:${newReviewer}:rights-request-review:${requestId}`;
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;
    const env = createEnv({
      reviews: {
        [reviewKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'Not Started',
          rightsReviewer: oldReviewer,
          submittedBy: 'submitter@example.com',
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestSubmittedUserID: 'submitter@example.com',
          rightsRequestDetails: { general: { assets: [] } },
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'Not Started',
            rightsReviewer: oldReviewer,
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: oldReviewer,
      rightsRequestStatus: 'In Progress',
      rightsReviewer: newReviewer,
    }, { email: 'reviewer@example.com' });

    const response = await updateReviewDetails(request, env, {});
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(env.RIGHTS_REQUEST_REVIEWS.put).toHaveBeenCalledWith(
      newReviewKey,
      expect.any(String),
    );

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: newReviewer,
      template: 'rights-request-reviewer-assigned',
    }));
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'submitter@example.com',
      template: 'rights-request-status-change',
    }));

    const messageSubjects = sendMessageMock.mock.calls.map(([, , payload]) => payload.subject);
    expect(messageSubjects).toContain('Rights Request Assigned to You');
    expect(messageSubjects).toContain('Your Rights Request Has Been Assigned');
    expect(messageSubjects).toContain('Rights Request Status Update');
  });

  it('sends assignee notification and email on self-assignment in edit flow', async () => {
    const requestId = 'REQ-201D';
    const oldReviewer = 'other.reviewer@example.com';
    const actingReviewer = 'reviewer@example.com';
    const reviewKey = `user:${oldReviewer}:rights-request-review:${requestId}`;
    const newReviewKey = `user:${actingReviewer}:rights-request-review:${requestId}`;
    const primaryKey = `user:${actingReviewer}:rights-request:${requestId}`;
    const env = createEnv({
      reviews: {
        [reviewKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'Not Started',
          rightsReviewer: oldReviewer,
          submittedBy: actingReviewer,
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestSubmittedUserID: actingReviewer,
          rightsRequestDetails: { general: { assets: [] } },
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'Not Started',
            rightsReviewer: oldReviewer,
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: oldReviewer,
      rightsReviewer: actingReviewer,
    }, { email: actingReviewer });

    const response = await updateReviewDetails(request, env, {});
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(env.RIGHTS_REQUEST_REVIEWS.put).toHaveBeenCalledWith(
      newReviewKey,
      expect.any(String),
    );
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: actingReviewer,
      template: 'rights-request-reviewer-assigned',
    }));

    const messageSubjects = sendMessageMock.mock.calls.map(([, , payload]) => payload.subject);
    expect(messageSubjects).toContain('Rights Request Assigned to You');
    expect(messageSubjects).not.toContain('Your Rights Request Has Been Assigned');
  });

  it('does not send status or reviewer notifications when values are unchanged', async () => {
    const requestId = 'REQ-201C';
    const reviewer = 'assigned@example.com';
    const reviewKey = `user:${reviewer}:rights-request-review:${requestId}`;
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;
    const env = createEnv({
      reviews: {
        [reviewKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'In Progress',
          rightsReviewer: reviewer,
          submittedBy: 'submitter@example.com',
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestSubmittedUserID: 'submitter@example.com',
          rightsRequestDetails: { general: { assets: [] } },
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'In Progress',
            rightsReviewer: reviewer,
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      isUnassigned: false,
      reviewerEmail: reviewer,
      rightsRequestStatus: 'In Progress',
      rightsReviewer: reviewer,
      rightsRequestDetails: { budgetForUsage: { budgetForMarket: '$200' } },
    }, { email: 'reviewer@example.com' });

    const response = await updateReviewDetails(request, env, {});
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('falls back to unassigned lookup when isUnassigned is omitted', async () => {
    const requestId = 'REQ-202';
    const assignedKey = 'user:reviewer@example.com:rights-request-review:REQ-202';
    const unassignedKey = 'user:unassigned:rights-request-review:REQ-202';
    const primaryKey = 'user:submitter@example.com:rights-request:REQ-202';
    const env = createEnv({
      reviews: {
        [unassignedKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'Not Started',
          rightsReviewer: '',
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestDetails: {
            materialsNeeded: {
              usageRightsRequired: ['Music'],
            },
          },
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'Not Started',
            rightsReviewer: '',
          },
        },
      },
    });

    const request = createRequest({
      requestId,
      rightsRequestDetails: {
        materialsNeeded: {
          usageRightsRequired: ['Music', 'Talent'],
        },
      },
    }, { email: 'reviewer@example.com' });

    const response = await updateReviewDetails(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(env.RIGHTS_REQUEST_REVIEWS.get.mock.calls[0][0]).toBe(assignedKey);
    expect(env.RIGHTS_REQUEST_REVIEWS.get.mock.calls[1][0]).toBe(unassignedKey);

    const updatedRequest = JSON.parse(env.RIGHTS_REQUESTS.put.mock.calls[0][1]);
    expect(updatedRequest.rightsRequestDetails.materialsNeeded.usageRightsRequired).toEqual([
      'Music',
      'Talent',
    ]);
  });
});

// ---------------------------------------------------------------------------
// assignReview
// ---------------------------------------------------------------------------

function createAssignRequest(body, user = { email: 'reviewer@example.com' }) {
  return {
    user,
    url: 'https://example.com/api/rightsrequests/reviews/assign',
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('rightsrequests assignReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasManageRightsPermissionMock.mockReturnValue(true);
    hasAdminRightsPermissionMock.mockReturnValue(true);
    fetchHelixSheetMock.mockResolvedValue({
      'example.com': { permissions: ['manage-rights'] },
    });
  });

  it('assigns an unassigned review to self (standard flow)', async () => {
    const requestId = 'ASSIGN-100';
    const unassignedKey = `user:unassigned:rights-request-review:${requestId}`;
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;
    const callerEmail = 'reviewer@example.com';

    const env = createEnv({
      reviews: {
        [unassignedKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'Not Started',
          rightsReviewer: '',
          submittedBy: 'submitter@example.com',
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestReviewDetails: { rightsRequestStatus: 'Not Started', rightsReviewer: '' },
        },
      },
    });

    const request = createAssignRequest({ requestId }, { email: callerEmail });
    const response = await assignReview(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Unassigned entry deleted
    expect(env.RIGHTS_REQUEST_REVIEWS.delete).toHaveBeenCalledWith(unassignedKey);
    // New assigned entry written for caller
    const assignedKey = `user:${callerEmail}:rights-request-review:${requestId}`;
    expect(env.RIGHTS_REQUEST_REVIEWS.put).toHaveBeenCalledWith(
      assignedKey,
      expect.any(String),
    );
    // Primary request updated
    const updatedRequest = JSON.parse(env.RIGHTS_REQUESTS.put.mock.calls[0][1]);
    expect(updatedRequest.rightsRequestReviewDetails.rightsReviewer).toBe(callerEmail);
    expect(updatedRequest.rightsRequestReviewDetails.rightsRequestStatus).toBe('In Progress');
  });

  it('reassigns an already-assigned review to self using currentReviewerEmail (All Active take-over)', async () => {
    const requestId = 'ASSIGN-200';
    const currentReviewer = 'other@example.com';
    const callerEmail = 'reviewer@example.com';
    const currentReviewerKey = `user:${currentReviewer}:rights-request-review:${requestId}`;
    const primaryKey = `user:submitter@example.com:rights-request:${requestId}`;

    const env = createEnv({
      reviews: {
        // No unassigned key — review is held by another reviewer
        [currentReviewerKey]: {
          requestId: primaryKey,
          rightsRequestStatus: 'In Progress',
          rightsReviewer: currentReviewer,
          submittedBy: 'submitter@example.com',
        },
      },
      requests: {
        [primaryKey]: {
          rightsRequestID: requestId,
          rightsRequestReviewDetails: {
            rightsRequestStatus: 'In Progress',
            rightsReviewer: currentReviewer,
          },
        },
      },
    });

    const request = createAssignRequest(
      { requestId, currentReviewerEmail: currentReviewer },
      { email: callerEmail },
    );
    const response = await assignReview(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Previous reviewer's entry deleted
    expect(env.RIGHTS_REQUEST_REVIEWS.delete).toHaveBeenCalledWith(currentReviewerKey);
    // New entry written for caller
    const newAssignedKey = `user:${callerEmail}:rights-request-review:${requestId}`;
    expect(env.RIGHTS_REQUEST_REVIEWS.put).toHaveBeenCalledWith(
      newAssignedKey,
      expect.any(String),
    );
    // Primary request updated with new reviewer
    const updatedRequest = JSON.parse(env.RIGHTS_REQUESTS.put.mock.calls[0][1]);
    expect(updatedRequest.rightsRequestReviewDetails.rightsReviewer).toBe(callerEmail);
  });

  it('returns 404 when neither unassigned nor currentReviewerEmail key exists', async () => {
    const requestId = 'ASSIGN-404';
    const env = createEnv({ reviews: {}, requests: {} });

    const request = createAssignRequest(
      { requestId, currentReviewerEmail: 'other@example.com' },
      { email: 'reviewer@example.com' },
    );
    const response = await assignReview(request, env, null);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Review not found');
  });

  it('skips currentReviewerEmail lookup when it is not a valid email format', async () => {
    const requestId = 'ASSIGN-400';
    const env = createEnv({ reviews: {}, requests: {} });

    const request = createAssignRequest(
      { requestId, currentReviewerEmail: 'not-an-email' },
      { email: 'reviewer@example.com' },
    );
    const response = await assignReview(request, env, null);
    const data = await response.json();

    // Should 404 — no unassigned key and the malformed email is skipped
    expect(response.status).toBe(404);
    expect(data.error).toBe('Review not found');
    // Only the unassigned key should have been looked up; the bad email must not be used
    const lookedUpKeys = env.RIGHTS_REQUEST_REVIEWS.get.mock.calls.map(([k]) => k);
    expect(lookedUpKeys).toHaveLength(1);
    expect(lookedUpKeys[0]).toContain('unassigned');
  });
});
