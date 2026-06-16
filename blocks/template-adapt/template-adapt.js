/**
 * Template Adapt Block
 * Renders an iframe with the template adapt editor
 */

import {
  duplicateTemplate,
  deleteTemplate,
} from '../koassets-search/utils/templates.js';
import showToast from '../../scripts/toast/toast.js';
import { getAppLabel, getCurrentLocale, getAemLocaleSegment } from '../../scripts/locale-utils.js';

const INJECT_JS = '/blocks/template-adapt/template-adapt-aem.js';

function showLoader(message = 'Loading...') {
  const existing = document.querySelector(
    '.template-adaptation-loader',
  );
  if (existing) existing.remove();

  const html = `
    <div class="template-adaptation-loader">
      <div class="loader-content">
        <img class="loader-spinner"
          src="/icons/coke-loader.gif" alt="Loading">
        <div class="loader-text">${message}</div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function hideLoader() {
  const loader = document.querySelector(
    '.template-adaptation-loader',
  );
  if (loader) loader.remove();
}

export default function decorate(block) {
  // Get the template query parameter from the current page URL
  const urlParams = new URLSearchParams(window.location.search);
  const templatePath = urlParams.get('template');

  if (!templatePath) {
    return;
  }

  // Decode in case of double-encoding (%2520 → %20 → space)
  let decodedTemplatePath = decodeURIComponent(templatePath);

  let iframe;
  let currentTemplateItemId = decodedTemplatePath;
  let unsubscribeCartState = null;

  const isCurrentTemplateInCart = (items = []) => items.some((item) => {
    const itemId = item.assetId || item.id;
    return itemId === currentTemplateItemId
      || itemId === decodedTemplatePath
      || item.templatePath === decodedTemplatePath;
  });

  // Resolve cart button labels once at page load; reuse for every iframe status post.
  const templateCartLabelsPromise = (async () => {
    try {
      const ph = await getAppLabel();
      return {
        addToCart: ph('addToCart', 'Add to Cart'),
        removeFromCart: ph('removeFromCart', 'Remove from Cart'),
      };
    } catch (_e) {
      console.warn('Error getting app label:', _e);
      return null;
    }
  })();

  const postTemplateCartStatus = async (inCart) => {
    if (!iframe?.contentWindow) return;
    const labels = await templateCartLabelsPromise;
    iframe.contentWindow.postMessage({
      event: 'template-cart-status',
      inCart,
      labels,
    }, '*');
  };

  const messageHandler = (event) => {
    // ignore messages from other frames
    if (!iframe || event.source !== iframe.contentWindow) {
      return;
    }

    // Resize iframe to match content height
    if (event.data.event === 'iframe-resize' && event.data.height) {
      iframe.style.height = `${event.data.height}px !important`;
    }

    // Handle background copy completion — AEM's _chili-template.js called
    // history.replaceState after the adapted copy was created and verified
    // accessible. Update the parent EDS URL and tracking state to match,
    // without reloading the iframe (Chili editor keeps its in-memory edits).
    if (event.data.event === 'template-copy-ready'
      && event.data.adaptedTemplatePath) {
      const adapted = event.data.adaptedTemplatePath;
      const curLocale = getCurrentLocale();
      const newUrl = `/${curLocale}/templates/adapt?template=${encodeURIComponent(adapted)}`;
      window.history.replaceState(null, '', newUrl);
      decodedTemplatePath = adapted;
      currentTemplateItemId = adapted;
    }

    // Handle Close (or Save-and-Close) — AEM's returnToPreviousScreen() was
    // intercepted so instead of navigating the iframe it posts this message.
    if (event.data.event === 'template-close') {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = `/${getCurrentLocale()}/search`;
      }
      return;
    }

    // Handle template duplicate from iframe
    if (event.data.event === 'template-duplicate') {
      (async () => {
        showLoader('Duplicating template...');
        const newPath = await duplicateTemplate(
          decodedTemplatePath,
          event.data.title,
        );
        hideLoader();
        if (newPath) {
          const enc = encodeURIComponent(newPath);
          const locale = getCurrentLocale();
          window.open(
            `/${locale}/templates/adapt?template=${enc}`,
            '_blank',
          );
        }
      })();
    }

    // Handle template delete from iframe
    if (event.data.event === 'template-delete') {
      (async () => {
        showLoader('Deleting template copy...');
        await deleteTemplate(decodedTemplatePath);
        hideLoader();
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.close();
        }
      })();
    }

    // Check whether a template is already in the cart
    if (event.data.event === 'template-check-cart') {
      (async () => {
        const { getState } = await import(
          '../../scripts/cart-state.js'
        );
        const { cartTemplateItems = [] } = getState();
        currentTemplateItemId = event.data.assetId
          || event.data.templatePath
          || decodedTemplatePath;
        postTemplateCartStatus(isCurrentTemplateInCart(cartTemplateItems));
      })();
    }

    // Handle template add-to-cart from iframe
    if (event.data.event === 'template-add-to-cart') {
      (async () => {
        const {
          getState, setState, saveCartTemplateItems,
        } = await import('../../scripts/cart-state.js');
        const state = getState();
        const { cartTemplateItems = [] } = state;
        const itemId = event.data.assetId
          || event.data.templatePath;
        currentTemplateItemId = itemId || decodedTemplatePath;

        const exists = cartTemplateItems.some(
          (item) => (item.assetId || item.id) === itemId,
        );
        if (!exists) {
          const newItem = {
            assetId: itemId,
            templatePath: event.data.templatePath || '',
            title: event.data.title || '',
            name: event.data.title || '',
            thumbnail: event.data.thumbnail || '',
            contentType: 'templates',
            selectedRenditions: [],
          };
          const newItems = [...cartTemplateItems, newItem];
          setState({ cartTemplateItems: newItems });
          saveCartTemplateItems(newItems);
          localStorage.setItem('lastCartAddType', 'templates');
          const ph = await getAppLabel();
          const message = ph('templateAddedToCart', 'Template added to cart');
          showToast(message, 'success');
        }
      })();
    }

    // Handle template remove-from-cart from iframe
    if (event.data.event === 'template-remove-from-cart') {
      (async () => {
        const {
          getState, setState, saveCartTemplateItems,
        } = await import('../../scripts/cart-state.js');
        const { cartTemplateItems = [] } = getState();
        const itemId = event.data.assetId
          || event.data.templatePath;
        currentTemplateItemId = itemId || decodedTemplatePath;
        const filtered = cartTemplateItems.filter(
          (item) => (item.assetId || item.id) !== itemId,
        );
        setState({ cartTemplateItems: filtered });
        saveCartTemplateItems(filtered);

        const ph = await getAppLabel();
        const message = ph('templateRemovedFromCart', 'Template removed from cart');
        showToast(message, 'success');
      })();
    }
  };

  // create event listener before we load the iframe to not miss any events
  window.addEventListener('message', messageHandler);

  // Keep iframe cart button state synced when cart is changed outside iframe (e.g. cart modal)
  (async () => {
    const { getState, subscribe } = await import('../../scripts/cart-state.js');

    const syncStatus = () => {
      const { cartTemplateItems = [] } = getState();
      postTemplateCartStatus(isCurrentTemplateInCart(cartTemplateItems));
    };

    syncStatus();
    unsubscribeCartState = subscribe((...args) => {
      const state = args[0] || {};
      const updates = args[2] || {};
      if (updates.cartTemplateItems !== undefined) {
        postTemplateCartStatus(isCurrentTemplateInCart(state.cartTemplateItems || []));
      }
    });
  })();

  const beforeUnloadHandler = () => {
    if (unsubscribeCartState) {
      unsubscribeCartState();
      unsubscribeCartState = null;
    }
    window.removeEventListener('message', messageHandler);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  // Render the iframe (AEM path uses locale: en → us/en, ja → jp/ja)
  const locale = getCurrentLocale();
  const aemSegment = getAemLocaleSegment(locale);
  const iframeUrl = `/content/share/${aemSegment}/search-assets/details/template/adapt.html${templatePath}?inject=${INJECT_JS}`;

  block.innerHTML = `<iframe src="${iframeUrl}"
      scrolling="no"
      allowfullscreen=""
    ></iframe>`;

  iframe = block.querySelector('iframe');
}
