/**
 * Email Template Loader
 * Simple variable replacement for email templates with HTML escaping
 * 
 * Note: We use simple string replacement instead of Handlebars.compile()
 * because Cloudflare Workers block dynamic code evaluation (new Function()).
 * This works perfectly for simple {{variable}} substitution.
 * 
 * Security: All variables are HTML-escaped by default to prevent XSS.
 * Use triple braces {{{variable}}} for raw HTML (use with caution).
 */

import escapeHtml from 'escape-html';

/**
 * Re-export escapeHtml for use in other modules
 * Uses the standard 'escape-html' package for battle-tested HTML escaping
 */
export { escapeHtml };

/**
 * Render a template with data using simple string replacement
 * Supports Handlebars-style syntax:
 * - {{variable}} - Auto-escaped (safe)
 * - {{{variable}}} - Raw HTML (unescaped, use only for trusted HTML content)
 *
 * @param {string} templateHtml - HTML template string with {{variable}} placeholders
 * @param {Object} data - Data to inject into template
 * @returns {string} Rendered HTML
 */
export function renderTemplate(templateHtml, data) {
  let result = templateHtml;

  // Replace each variable in the data object
  for (const [key, value] of Object.entries(data)) {
    const stringValue = String(value || '');
    
    // First, replace triple-brace syntax {{{key}}} with raw HTML (no escaping)
    const rawRegex = new RegExp(`{{{\\s*${key}\\s*}}}`, 'g');
    result = result.replace(rawRegex, stringValue);
    
    // Then, replace double-brace syntax {{key}} with HTML-escaped value
    const escapedRegex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(escapedRegex, escapeHtml(stringValue));
  }

  // Warning: Check for unreplaced variables (helpful for debugging)
  const unreplaced = result.match(/{{{?[^}]+}}}?/g);
  if (unreplaced) {
    console.warn('[Template] Unreplaced variables found:', unreplaced);
  }

  return result;
}

/**
 * Helper functions for template rendering
 * These can be called before passing data to renderTemplate
 */

/**
 * Parse date from frontend: Date, ISO string, or { year, month, day } (date picker format).
 * Month in object is 1-based (1-12).
 * @param {Date|string|Object} date - Date to parse
 * @returns {Date|null} Parsed Date or null if invalid/missing
 */
export function toDate(date) {
  if (!date) return null;
  let dateObj;
  if (typeof date === 'object' && !(date instanceof Date)) {
    if (date.year && date.month && date.day) {
      // Use UTC so formatting with timeZone: 'UTC' yields the same calendar date in all environments
      dateObj = new Date(Date.UTC(date.year, date.month - 1, date.day));
    } else {
      dateObj = new Date(date);
    }
  } else {
    dateObj = new Date(date);
  }
  return Number.isNaN(dateObj.getTime()) ? null : dateObj;
}

/**
 * Format a date for email templates
 * @param {Date|string|Object} date - Date to format (can be Date, string, or {year, month, day} object)
 * @returns {string} Formatted date
 */
export function formatDate(date) {
  const dateObj = toDate(date);
  if (!dateObj) return '';
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Convert string to uppercase
 * @param {string} str - String to uppercase
 * @returns {string} Uppercased string
 */
export function uppercase(str) {
  if (!str) return '';
  return str.toUpperCase();
}

// Add more helper functions as needed
