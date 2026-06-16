/**
 * Date conversion utilities
 * Converted from React dateConverters.ts
 */

/**
 * Converts a date object to ISO date string (YYYY-MM-DD)
 * @param {Date|{year: number, month: number, day: number}|null|undefined} date
 *   - Date object or calendar date object
 * @returns {string|null} ISO formatted date string (YYYY-MM-DD) or null if invalid
 */
export const dateToISO = (date) => {
  if (!date) return null;

  // Handle native Date object
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Handle calendar date object with year, month, day properties
  if (date.year !== undefined && date.month !== undefined && date.day !== undefined) {
    const { year } = date;
    const month = String(date.month).padStart(2, '0');
    const day = String(date.day).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
};

/**
 * Converts ISO date string (YYYY-MM-DD) to Date object
 * @param {string|null|undefined} isoString - ISO formatted date string
 * @returns {Date|null} Date object or null if input is invalid
 */
export const isoToDate = (isoString) => {
  if (!isoString) return null;

  const parts = isoString.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
  const day = parseInt(parts[2], 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  return new Date(year, month, day);
};

/**
 * Converts epoch timestamp (seconds) to Date object
 * @param {number|null|undefined} epoch - Unix timestamp in seconds
 * @returns {Date|null} Date object or null if input is invalid
 */
export const epochToDate = (epoch) => {
  if (epoch === null || epoch === undefined) return null;
  return new Date(epoch * 1000);
};

/**
 * Converts Date object to epoch timestamp (seconds)
 * @param {Date|null|undefined} date - Date object
 * @returns {number|null} Unix timestamp in seconds or null if input is invalid
 */
export const dateToEpoch = (date) => {
  if (!date || !(date instanceof Date)) return null;
  return Math.floor(date.getTime() / 1000);
};

export default {
  dateToISO,
  isoToDate,
  epochToDate,
  dateToEpoch,
};
