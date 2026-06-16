/**
 * Sanitize utility functions
 * Provides common sanitization logic: lowercase and replace spaces with hyphens
 */

// Sanitize any string: lowercase and replace spaces with hyphens
const sanitize = (str) => str.trim().toLowerCase().replace(/\s+/g, '-');

// Sanitize filename while preserving extension
const sanitizeFileName = (fileName) => {
  const lastDotIndex = fileName.lastIndexOf('.');
  const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
  const nameWithoutExtension = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;

  return sanitize(nameWithoutExtension).replace(/[^a-zA-Z0-9.-]/g, '_') + extension;
};

// Build filename with itemId prepended
const buildFileNameWithId = (itemId, fileName) => `${itemId}-${fileName}`;

module.exports = {
  sanitize,
  sanitizeFileName,
  buildFileNameWithId,
};
