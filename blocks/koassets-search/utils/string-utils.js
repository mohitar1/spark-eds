/**
 * String utilities
 * Converted from React stringUtils.ts
 */

/**
 * Split a string by separator into a specified number of chunks
 * @param {string} string - The string to split
 * @param {string} separator - The separator to split by
 * @param {number} num - The number of chunks to return
 * @returns {string[]} Array of string chunks
 * @example split('a:b:c', ':', 2) returns ['a', 'b:c']
 */
export function split(string, separator, num) {
  if (num <= 0) return [];
  if (num === 1) return [string];

  const parts = string.split(separator);
  if (parts.length <= num) return parts;

  // Take the first (num-1) parts and join the rest
  const result = parts.slice(0, num - 1);
  const remaining = parts.slice(num - 1).join(separator);
  result.push(remaining);

  return result;
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string
 */
export function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncate a string to a specified length with ellipsis
 * @param {string} str - The string to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @param {string} [suffix='...'] - Suffix to append when truncated
 * @returns {string} The truncated string
 */
export function truncate(str, maxLength, suffix = '...') {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

export default {
  split,
  capitalize,
  truncate,
};
