/**
 * Rights Request Reminder Handlers
 *
 * Two scheduled handlers (invoked by cron):
 * 1. Status Reminders - Alert reviewers when a request has been in In Progress / Quote Pending /
 *    Release Pending for 7+ days (elapsed time in current status).
 * 2. Usage Rights Reminders - Alert submitters before asset rights expire (90, 60, 30, 1 days)
 *
 * Implementation lives in ../util/rights-request-util.js (processStatusReminders, processUsageRightsReminders).
 */

import { processStatusReminders, processUsageRightsReminders } from '../util/rights-request-util.js';

/**
 * Handle status reminders for rights requests.
 * @param {Object} env - Cloudflare environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 */
export async function handleStatusReminders(env, ctx) {
  return processStatusReminders(env, ctx);
}

/**
 * Handle usage rights expiration reminders.
 * @param {Object} env - Cloudflare environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 */
export async function handleUsageRightsReminders(env, ctx) {
  return processUsageRightsReminders(env, ctx);
}
