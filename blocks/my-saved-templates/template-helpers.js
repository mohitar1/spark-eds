/**
 * Data layer for My Saved Templates block
 * Handles fetching and filtering saved templates
 */

import { MY_TEMPLATES_API } from '../../scripts/utils/template-metadata.js';
import {
  showAlertModal,
  AEM_AUTH_ERROR,
} from '../koassets-search/components/template-modals.js';

/**
 * Map raw API template to internal shape
 * @param {Object} raw - Raw template object from API
 * @returns {Object} Internal template shape
 */
function mapApiTemplate(raw) {
  const path = raw.path || raw.templatePath || '';
  return {
    path,
    title: raw.title || raw.name || path.split('/').pop() || '',
    created: raw.created || '',
    lastModified: raw.lastModified || raw['jcr:lastModified'] || '',
    size: raw.size || 0,
    uuid: raw.uuid || '',
    thumbnail: path
      ? `${path}.renditions/list/asset.rendition`
      : '/icons/image-placeholder.svg',
    baseTemplate: raw.baseTemplate || '',
  };
}

/**
 * Load saved templates from the API
 * @returns {Promise<Array<Object>>} Array of template objects
 */
export async function loadSavedTemplates() {
  try {
    const response = await fetch(MY_TEMPLATES_API, {
      credentials: 'include',
    });

    if (response.status === 401) {
      showAlertModal(AEM_AUTH_ERROR);
      return [];
    }

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.templates)) {
        return data.templates.map(mapApiTemplate);
      }
    }
  } catch {
    // API failed
  }

  return [];
}

/**
 * Filter templates by search term (case-insensitive title match)
 * @param {Array<Object>} templates - Array of template objects
 * @param {string} searchTerm - Search term to filter by
 * @returns {Array<Object>} Filtered array
 */
export function filterTemplates(templates, searchTerm) {
  if (!searchTerm) return templates;
  const term = searchTerm.toLowerCase();
  return templates.filter(
    (tmpl) => tmpl.title.toLowerCase().includes(term),
  );
}

/**
 * Sort templates by field and direction
 * @param {Array<Object>} templates - Array of template objects
 * @param {string} sortField - Field to sort by
 * @param {string} sortDirection - 'ascending' or 'descending'
 * @returns {Array<Object>} Sorted copy
 */
export function sortTemplates(templates, sortField, sortDirection) {
  const sorted = [...templates];
  const dir = sortDirection === 'ascending' ? 1 : -1;
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'created':
        cmp = new Date(a.created || a.lastModified || 0)
          - new Date(b.created || b.lastModified || 0);
        break;
      case 'size':
        cmp = (a.size || 0) - (b.size || 0);
        break;
      case 'lastModified':
      default:
        cmp = new Date(a.lastModified || a.created || 0)
          - new Date(b.lastModified || b.created || 0);
        break;
    }
    return cmp * dir;
  });
  return sorted;
}
