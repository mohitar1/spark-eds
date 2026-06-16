// add delayed functionality here

// Import and initialize priority messages check
import { initPriorityMessages } from './notifications/priority-modal.js';
import showToast from './toast/toast.js';
import {
  checkAemUserExists,
  showAemLoginModal,
} from './aem-auth.js';

// Initialize priority message check on page load
initPriorityMessages();

// Proactive AEM user provisioning check
if (window.user) {
  try {
    const exists = await checkAemUserExists();
    if (!exists) {
      const success = await showAemLoginModal({
        title: 'Note',
        message: 'To fully utilize template features within KO Assets, we need you to log in one more time.'
          + ' This ensures all your template-related items are synced and ready for the enhanced platform.'
          + ' Please click the ‘Login’ button below; a temporary window will open to complete the process.',
      });
      if (success) {
        showToast('Template support enabled', 'success');
      }
    }
  } catch {
    // Service account or network error — skip silently
  }
}

// Note: Cart background jobs are automatically initialized in cart-service.js (singleton pattern)
// No need to initialize here to avoid circular dependency
