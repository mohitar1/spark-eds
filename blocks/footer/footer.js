import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../../scripts/scripts.js';
import { localizePath } from '../../scripts/locale-utils.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : localizePath('/footer');
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  // Localize all footer links to preserve current locale
  footer.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/')) {
      link.setAttribute('href', localizePath(href));
    }
  });

  block.append(footer);
}
