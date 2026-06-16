/**
 * Rights Reviewers Configuration
 * Static list of users who receive notifications for new rights requests
 */

export const RIGHTS_REVIEWERS = [
  'jfait@adobe.com',
  // Add more reviewers here
];

/**
 * Check if a user is a rights reviewer
 * @param {string} email - User email address
 * @returns {boolean} True if user is a reviewer
 */
export function isReviewer(email) {
  return RIGHTS_REVIEWERS.includes(email?.toLowerCase());
}
