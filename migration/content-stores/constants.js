/**
 * Shared constants for content migration tools
 */

// Path separator used in hierarchy paths
// Uses ' > ' to avoid conflicts with '/' characters in item titles
const PATH_SEPARATOR = ' >>> ';

// Data directory containing all extracted/generated content
const DATA_DIR = 'DATA';

module.exports = {
  PATH_SEPARATOR,
  DATA_DIR,
};
