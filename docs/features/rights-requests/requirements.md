# Rights Requests - Requirements

**Status:** ✅ Implemented (Phase 1 complete)  
**Last Updated:** 2026-02-03  
**Related:** [Feature Documentation](./README.md) | [Demo Script](demo-script.md)

---

## Business Requirements

### Problem Statement

Users need to download assets that require rights clearance approval before use. Currently, there is no systematic way to:
- Request rights approval from designated reviewers
- Track the status of pending requests
- Get notified when requests are reviewed
- Maintain an audit trail of rights approvals

### Business Goals

1. **Compliance**: Ensure all asset usage complies with rights management policies
2. **Efficiency**: Streamline the approval process for both requesters and reviewers
3. **Transparency**: Provide visibility into request status for all stakeholders
4. **Auditability**: Maintain complete records of who requested what and when

### Success Metrics

- ✅ 100% of restricted assets require rights approval before download
- ✅ Average approval time < 5 business days
- ✅ Users can track request status in real-time
- ✅ Reviewers have centralized dashboard for managing requests

---

## Functional Requirements

### FR-1: Asset Clearance Detection
**Status:** ✅ Implemented

**User Story:**  
As a user attempting to download an asset, I want the system to automatically check if rights clearance is required, so I know if I need to submit a request.

**Acceptance Criteria:**
- System checks FADEL clearance status for all assets in cart before download
- If any asset requires clearance, rights request modal is shown
- User cannot download without submitting request or removing restricted assets
- Clear messaging explains why rights approval is needed

### FR-2: Submit Rights Request
**Status:** ✅ Implemented

**User Story:**  
As a user, I want to submit a rights request with context about my intended use, so reviewers can make informed decisions.

**Acceptance Criteria:**
- Form includes:
  - Asset list with thumbnails
  - Intended use (required, text area, min 10 chars)
  - Distribution channels (required, text area)
  - Additional notes (optional)
- Form validation prevents submission with missing required fields
- Submission creates request record in KV store
- User receives confirmation notification
- User can view request in "My Rights Requests" page

### FR-3: Notification System
**Status:** ✅ Implemented

**User Story:**  
As a user or reviewer, I want to be notified when requests are submitted or updated, so I can respond promptly.

**Acceptance Criteria:**
- **Submitter notifications:**
  - Email sent when request is submitted (confirmation)
  - In-app notification when status changes
  - Email sent when request is approved/rejected
- **Reviewer notifications:**
  - Email sent when new request is assigned to them
  - In-app notification badge shows unread count
  - Email digest of pending requests (daily)

### FR-4: Reviewer Dashboard
**Status:** ✅ Implemented

**User Story:**  
As a rights reviewer, I want a centralized dashboard to view and manage all requests, so I can efficiently process approvals.

**Acceptance Criteria:**
- Page shows all requests the reviewer can access
- Tabs for: Unassigned, Assigned to Me, All Requests
- Each request shows:
  - Submitter name and email
  - Submission date
  - Number of assets
  - Current status
  - Preview thumbnails
- Reviewer can assign unassigned requests to themselves
- Reviewer can filter/sort by date, status, submitter

### FR-5: Update Request Status
**Status:** ✅ Implemented

**User Story:**  
As a reviewer, I want to update the status of requests and add internal notes, so I can track progress and communicate with other reviewers.

**Acceptance Criteria:**
- Status dropdown: Not Started, In Progress, Approved, Rejected
- Internal notes field (not visible to submitter)
- Update triggers notification to submitter
- Status history is recorded with timestamps
- Approval/rejection includes reason/notes

### FR-6: View Request Details
**Status:** ✅ Implemented

**User Story:**  
As a user or reviewer, I want to see full details of a request including all assets and context, so I can understand the request fully.

**Acceptance Criteria:**
- Details page shows:
  - All submitted information (intended use, distribution, notes)
  - Full asset list with previews and metadata
  - Clearance information for each asset
  - Current status and assigned reviewer
  - Status update history (if reviewer)
- Asset previews are clickable to view full asset details
- Submitter contact information is displayed

### FR-7: User Request History
**Status:** ✅ Implemented

**User Story:**  
As a user, I want to see all my past and current rights requests, so I can track what I've requested and when.

**Acceptance Criteria:**
- "My Rights Requests" page accessible from header nav
- Shows all requests submitted by current user
- Displays request date, status, asset count
- Allows filtering by status (pending, approved, rejected)
- Click request to view full details

---

## Non-Functional Requirements

### NFR-1: Performance
**Status:** ✅ Implemented

- FADEL clearance check completes within 2 seconds (p95)
- Request list page loads within 1 second (p95)
- Request submission completes within 1 second
- Email notifications sent within 5 minutes of trigger event

### NFR-2: Security & Privacy
**Status:** ✅ Implemented

- Only authenticated users can submit requests
- Users can only view their own submitted requests
- Only designated reviewers can access "My Rights Reviews"
- Reviewer role checked via FADEL API
- All data stored encrypted in Cloudflare KV
- Asset metadata does not include sensitive information

### NFR-3: Scalability
**Status:** ✅ Implemented

- System handles up to 1000 concurrent requests
- KV store supports unlimited request history
- Email queue handles burst of 100+ notifications
- No single point of failure (Cloudflare Workers distributed)

### NFR-4: Accessibility
**Status:** ⏳ Partial

- ✅ Keyboard navigation supported
- ✅ ARIA labels on interactive elements
- ✅ Color contrast meets WCAG AA standards
- ⏳ Screen reader testing needed

### NFR-5: Usability
**Status:** ✅ Implemented

- Forms use clear labels and placeholders
- Error messages are specific and actionable
- Success confirmations are immediate and clear
- Mobile-responsive design for all pages

---

## Out of Scope

The following are explicitly **not** included in this feature:

❌ **Bulk approval/rejection** - Reviewers must process one request at a time  
❌ **Request editing** - Once submitted, requests cannot be edited (can cancel and resubmit)  
❌ **Conditional approvals** - Cannot approve for specific uses only (all or nothing)  
❌ **Approval delegation** - Cannot assign requests to other reviewers  
❌ **Approval workflow automation** - No auto-approval based on rules  
❌ **Integration with DAM approval** - Does not sync with external approval systems  
❌ **Request prioritization** - No way to mark requests as urgent/high priority  
❌ **Analytics dashboard** - No reporting on approval rates, avg time, etc.  

---

## Future Enhancements

Potential improvements for future phases:

### Phase 2 (Planned)
- Request cancellation by submitter
- Bulk operations for reviewers (approve/reject multiple)
- Request comments/conversation thread
- Analytics dashboard for metrics

### Phase 3 (Under Consideration)
- Approval workflow routing (multi-stage approvals)
- Conditional approvals (approve for specific use cases only)
- Integration with external rights management systems
- SLA tracking and escalation

---

## Dependencies

### External Services
- **FADEL API**: Required for clearance checking and reviewer role validation
- **Email Service**: Required for email notifications (currently SendGrid)
- **Cloudflare KV**: Required for data persistence

### Internal Features
- **Authentication**: Must be logged in to submit requests
- **Cart System**: Rights request triggered from cart download flow
- **Asset Metadata**: Uses existing asset metadata for display

---

## Assumptions

- Users have valid email addresses for notifications
- FADEL API is authoritative source for clearance status
- Reviewers are trained on approval policies
- Email delivery is reliable (fallback to in-app only if email fails)
- Asset previews/thumbnails are already generated

---

## Risk Assessment

### High Risk
- **FADEL API downtime**: Mitigated by caching clearance status, graceful degradation

### Medium Risk
- **Email delivery failures**: Mitigated by in-app notifications, retry logic
- **Reviewer availability**: Mitigated by assignment system, multiple reviewers

### Low Risk
- **User confusion on workflow**: Mitigated by clear UI, demo training
- **Storage limits in KV**: Mitigated by archiving old requests (future)

---

## Revision History

| Date       | Version | Changes                                      | Author |
|------------|---------|----------------------------------------------|--------|
| 2024-11-15 | 1.0     | Initial requirements document                | Product Team |
| 2024-12-01 | 1.1     | Added NFR-4 (Accessibility)                  | Dev Team |
| 2026-02-03 | 1.2     | Marked Phase 1 as implemented, added status  | Documentation Update |
