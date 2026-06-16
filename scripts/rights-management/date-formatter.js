/**
 * Shared date formatting utilities for rights requests
 */

/**
 * Default locale for date formatting
 */
const DEFAULT_LOCALE = 'en-US';

/**
 * Format a date string for display in UI (e.g., "Jan 5, 2026")
 * Handles Date objects, date strings, and invalid inputs
 * Uses UTC timezone to ensure dates display consistently regardless of user's local timezone
 * @param {Date|string|object} dateString - Date to format
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A';

  // Handle if dateString is already a Date object
  let date;
  if (dateString instanceof Date) {
    date = dateString;
  } else if (typeof dateString === 'object') {
    // If it's an object (like plain object), can't convert
    return 'N/A';
  } else {
    date = new Date(dateString);
  }

  // Check if date is valid
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  // Use UTC timezone to display dates consistently (dates stored as GMT midnight)
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  };
  return date.toLocaleDateString(DEFAULT_LOCALE, options);
}

/**
 * Format a date to ISO date string (YYYY-MM-DD)
 * @param {Date|string|object} dateStr - Date to format
 * @returns {string} - ISO formatted date string or 'N/A' if invalid
 */
export function formatDateFromString(dateStr) {
  if (!dateStr) return 'N/A';

  try {
    // Handle if dateStr is already a Date object
    let date;
    if (dateStr instanceof Date) {
      date = dateStr;
    } else if (typeof dateStr === 'object') {
      // If it's a plain object, return N/A
      return 'N/A';
    } else {
      date = new Date(dateStr);
    }

    // Check if date is valid
    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }

    return date.toISOString().split('T')[0];
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Convert date to GMT string format matching JCR sample data format
 * Output format: "Mon Jan 05 2026 00:00:00 GMT+0000"
 * @param {Date|string|number|object} date - Date to convert
 * @returns {string} - Formatted GMT date string or empty string if invalid
 */
export function formatDateToGMT(date) {
  if (!date) return '';

  try {
    let dateObj;

    // Handle different input types
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date);
    } else if (typeof date === 'object') {
      // If it's already an object, return empty string
      return '';
    } else {
      return '';
    }

    // Check if date is valid
    if (Number.isNaN(dateObj.getTime())) {
      return '';
    }

    // Convert to UTC string (e.g., "Mon Jan 05 2026 00:00:00 GMT+0000")
    return dateObj.toUTCString().replace('GMT', 'GMT+0000');
  } catch (error) {
    return '';
  }
}

/**
 * Convert date string/object to epoch milliseconds for API calls
 * @param {Date|string|object} dateStr - Date to convert
 * @returns {number} - Epoch milliseconds or 0 if invalid
 */
export function dateStringToEpoch(dateStr) {
  if (!dateStr) return 0;

  try {
    // Handle if dateStr is already a Date object
    let date;
    if (dateStr instanceof Date) {
      date = dateStr;
    } else if (typeof dateStr === 'object') {
      // If it's a plain object, can't convert
      // eslint-disable-next-line no-console
      console.error('Invalid date object passed to dateStringToEpoch:', dateStr);
      return 0;
    } else {
      date = new Date(dateStr);
    }

    // Check if date is valid
    const timestamp = date.getTime();
    if (Number.isNaN(timestamp)) {
      // eslint-disable-next-line no-console
      console.error('Invalid date string passed to dateStringToEpoch:', dateStr);
      return 0;
    }

    return timestamp;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error converting date to epoch:', dateStr, error);
    return 0;
  }
}
