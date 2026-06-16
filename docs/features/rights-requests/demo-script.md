# Rights Requests Feature Demo Script

**Duration:** ~5 minutes  
**Audience:** Stakeholders, new team members  
**Last Updated:** 2026-02-03

## Overview

This demo shows the complete rights request workflow from submission to approval.

## Prerequisites

- Logged into KOAssets as a regular user
- Test assets available that require rights clearance
- Rights manager account available for review workflow

## Demo Flow

### Part 1: Submitting a Rights Request (2 min)

**As Regular User:**

1. **Add assets to cart**
   - Navigate to search page
   - Search for "Coca-Cola Holiday Campaign 2024"
   - Add 2-3 assets to cart
   - Show cart panel with selected assets

2. **Attempt download**
   - Click "Download Selected" button
   - System checks clearance status via FADEL
   - Rights request modal appears

3. **Fill request form**
   - **Intended Use:** "Marketing campaign for North America region"
   - **Distribution:** "Digital and print media"
   - **Additional Notes:** "Need approval by end of week"
   - Click "Submit Request"

4. **Confirmation**
   - Toast notification: "Rights request submitted successfully"
   - Navigate to "My Rights Requests"
   - Show submitted request with "Not Started" status

### Part 2: Reviewing Request (2 min)

**As Rights Manager:**

1. **View new request notification**
   - Show notification icon badge (unread count)
   - Open notification: "New rights request from [user]"
   - Click notification to open "My Rights Reviews"

2. **Assign request**
   - View "Unassigned" tab
   - See new request in list
   - Click "Assign to Me"
   - Request moves to "Assigned" tab

3. **Review details**
   - Click request to open details page
   - Show asset previews and clearance information
   - Review submitter details and request notes

4. **Update status**
   - Change status dropdown from "Not Started" to "In Progress"
   - Add internal note: "Contacting rights holder"
   - Click "Update Status"
   - Show success confirmation

### Part 3: Submitter Sees Update (1 min)

**Back as Regular User:**

1. **Check notification**
   - Show new notification: "Rights request status updated"
   - Open "My Rights Requests"
   - Show request now shows "In Progress" status

2. **View details**
   - Click request to see full details
   - Show assigned reviewer information
   - Show status history (if available)

## Key Points to Highlight

✅ **User Experience**
- Simple, guided workflow
- Clear notifications at each step
- Transparency into review process

✅ **Manager Efficiency**
- Centralized dashboard
- Easy assignment workflow
- All relevant information in one place

✅ **Integration**
- Automatic clearance checking via FADEL
- Email + in-app notifications
- Asset previews and metadata

## Common Questions

**Q: How long does approval typically take?**  
A: Varies by complexity, typically 2-5 business days

**Q: Can users cancel requests?**  
A: Yes, users can cancel their own pending requests

**Q: What if multiple assets need different approval levels?**  
A: Each asset's clearance details are shown separately

## Demo Video

For a recorded walkthrough, see: [Link to SharePoint video when available]

---

**Note:** This is a demo script focusing on the happy path. For comprehensive testing, see the Testing section in the main [README](README.md).
