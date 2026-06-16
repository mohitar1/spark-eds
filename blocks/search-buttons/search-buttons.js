export default function decorate(block) {
  // Find the ul element within the block
  const ul = block.querySelector('ul');
  if (!ul) return;

  // Create a container for the buttons grid
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'search-buttons-container';

  // Process each list item
  [...ul.children].forEach((li) => {
    const link = li.querySelector('a');
    const text = li.textContent.trim();

    // Create button element
    const button = document.createElement(link ? 'a' : 'button');
    button.className = 'search-button';

    if (link) {
      // If there's a link, copy its attributes
      button.href = link.href;
      button.title = link.title || text;
      if (link.target) button.target = link.target;
    } else {
      // If no link, make it disabled
      button.disabled = true;
      button.className += ' disabled';
    }

    // Add text content inside span element
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    button.appendChild(textSpan);

    buttonsContainer.appendChild(button);
  });

  // Replace the original content with the buttons container
  block.innerHTML = '';
  block.appendChild(buttonsContainer);
}
