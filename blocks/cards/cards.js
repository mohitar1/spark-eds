import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });

    const cardBody = li.querySelector('.cards-card-body');
    const link = cardBody?.querySelector('a');
    if (link) {
      // Store the original link's href and target
      const { href } = link;
      const { target } = link;

      // Make the whole card clickable
      li.style.cursor = 'pointer';
      li.addEventListener('click', (e) => {
        // Prevent default if clicking directly on the link
        if (e.target.tagName === 'A') return;

        // Navigate to the link
        if (target === '_blank') {
          window.open(href, '_blank');
        } else {
          window.location.href = href;
        }
      });

      // Keep the original link styling but remove its default click behavior for card clicks
      link.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    ul.append(li);
  });
  if (block.classList.contains('highlights') || block.classList.contains('two-up')) {
    ul.querySelectorAll('a.button').forEach((btn) => {
      btn.classList.remove('button', 'primary', 'secondary');
    });
    ul.querySelectorAll('.button-container').forEach((container) => {
      container.classList.remove('button-container');
    });
  }

  ul.querySelectorAll('picture > img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.textContent = '';
  block.append(ul);
}
