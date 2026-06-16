/**
 * Cart Rights Extension Submitted Component
 * Confirmation screen after rights extension submission
 */

/**
 * Render cart rights extension submitted content
 * @param {function} t - Translation function (key, fallback) => string
 * @returns {string} HTML string
 */
export function renderCartRightsExtensionSubmitted(t = (key, fallback) => fallback) {
  return `
    <div class="cart-rights-extension-submitted">
      <div class="cart-rights-extension-submitted-content">
        <!-- Success Icon -->
        <div class="success-icon">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="58" stroke="#4CAF50" stroke-width="4" fill="none"/>
            <path d="M35 60L52 77L85 44" stroke="#4CAF50" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Success Heading -->
        <h2 class="success-heading">${t('success', 'SUCCESS')}</h2>

        <!-- Success Message -->
        <p class="success-message">
          ${t('thankYouForYourRequest', 'Thank you for your request. We are working to find the best service for you.')}
        </p>

        <p class="success-submessage">
          ${t('shortlyYouWillFindNotification', 'Shortly you will find a notification in your email.')}
        </p>

        <!-- Continue Button -->
        <button 
          class="continue-button primary-button"
          data-action="continue-after-submission"
          type="button"
        >
          ${t('continue', 'Continue')}
        </button>
      </div>
    </div>
  `;
}

export default renderCartRightsExtensionSubmitted;
