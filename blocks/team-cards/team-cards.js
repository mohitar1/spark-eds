import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  const rows = [...block.children];

  // Check if first row has only one cell (title row)
  let titleDiv = null;
  let startIndex = 0;
  if (rows.length > 0 && rows[0].children.length === 1) {
    // First row is a title
    titleDiv = document.createElement('div');
    titleDiv.className = 'team-cards-title';
    titleDiv.textContent = rows[0].textContent.trim();
    startIndex = 1; // Skip the title row when processing cards
  }

  // Process remaining rows as cards
  rows.slice(startIndex).forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'team-cards-card-image';
      else div.className = 'team-cards-card-body';
    });

    ul.append(li);
  });

  ul.querySelectorAll('picture > img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '300' }])));
  block.textContent = '';

  // Add title if it exists
  if (titleDiv) {
    block.append(titleDiv);
  }

  block.append(ul);
}
