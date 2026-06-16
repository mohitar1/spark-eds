/**
 * Cart Request Rights Extension Component
 * Form for requesting rights extension for restricted assets
 * Matches React CartRequestRightsExtension.tsx
 */

import { EAGER_LOAD_IMAGE_COUNT } from '../../constants/images.js';
import { renderPictureHTML } from '../picture.js';

/**
 * Format date for display (matches React)
 * @param {Object|number|null} dateInput - Date object or epoch
 * @returns {string} Formatted date string
 */
function formatDate(dateInput) {
  if (!dateInput) return '';

  let date;
  if (typeof dateInput === 'number') {
    date = new Date(dateInput);
  } else if (dateInput.year && dateInput.month && dateInput.day) {
    date = new Date(dateInput.year, dateInput.month - 1, dateInput.day);
  } else {
    return '';
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
}

/**
 * Render cart request rights extension form (matches React structure)
 * @param {Object} options - Options
 * @param {function} t - Translation function (key, fallback) => string
 * @returns {string} HTML string
 */
export function renderCartRequestRightsExtension(options, t = (key, fallback) => fallback) {
  const {
    restrictedAssets = [],
    intendedUse = {},
    formData = {},
  } = options;

  return `
    <div class="cart-request-rights-extension">
      <div class="cart-request-rights-extension-content">
        <!-- Asset List Column -->
        <div class="cart-request-rights-extension-assets">
          <!-- Intended Use Summary -->
          <div class="intended-use-section">
            <h3>${t('intendedUse', 'Intended Use')}</h3>
            <div class="intended-use-grid">
              <div class="intended-use-item">
                <label>${t('intendedAirDate', 'INTENDED AIR DATE')}</label>
                <div>${formatDate(intendedUse.airDate)}</div>
              </div>
              <div class="intended-use-item">
                <label>${t('intendedPullDate', 'INTENDED PULL DATE')}</label>
                <div>${formatDate(intendedUse.pullDate)}</div>
              </div>
              <div class="intended-use-item">
                <label>${t('intendedMarkets', 'INTENDED MARKETS')}</label>
                <div>${Array.from(intendedUse.selectedMarkets || []).map((c) => c.name).join(', ') || t('notApplicable', 'N/A')}</div>
              </div>
              <div class="intended-use-item">
                <label>${t('intendedMedia', 'INTENDED MEDIA')}</label>
                <div>${Array.from(intendedUse.selectedMediaChannels || []).map((c) => c.name).join(', ') || t('notApplicable', 'N/A')}</div>
              </div>
            </div>
          </div>

          <h3>${t('assets', 'Assets')}</h3>

          <!-- Asset List -->
          <div class="asset-list-items tccc-custom-scrollbar">
            ${restrictedAssets.map((asset, index) => {
    const eager = index < EAGER_LOAD_IMAGE_COUNT;

    return `
              <div class="asset-list-item" data-asset-id="${asset.assetId}">
                <div class="asset-thumbnail">
                  <div class="item-thumbnail">
                    ${renderPictureHTML({ asset, width: 350, eager })}
                  </div>
                </div>
                <div class="asset-details">
                  <div class="asset-title">${asset.title || asset.name || t('untitled', 'Untitled')}</div>
                  <div class="asset-type">
                    <span class="label-type">${t('type', 'TYPE')}:</span>
                    <span class="type-val">${asset.formatLabel?.toUpperCase() || t('unknown', 'UNKNOWN')}</span>
                  </div>
                </div>
              </div>
            `;
  }).join('')}
          </div>
        </div>

        <!-- Rights Extension Request Form Column -->
        <div class="cart-request-rights-extension-form">
          <div class="cart-request-rights-extension-form-content tccc-custom-scrollbar">
            <h3>${t('rightsExtensionRequest', 'Rights Extension Request')}</h3>

            <!-- Agency Information -->
            <div class="form-field">
              <label>
                ${t('agencyOrAssociateQuestion', 'Are you with an agency, or a TCCC Associate? Please note all TCCC Associates will have an @coca-cola email address.')}
              </label>
              <div class="form-select-wrapper">
                <select
                  class="form-select"
                  id="agencytype"
                  name="agencytype"
                >
                  <option value="TCCC Associate" ${formData.agencyType === 'TCCC Associate' || !formData.agencyType ? 'selected' : ''}>${t('tcccAssociate', 'TCCC Associate')}</option>
                  <option value="Agency" ${formData.agencyType === 'Agency' ? 'selected' : ''}>${t('agency', 'Agency')}</option>
                </select>
                <span class="toggle-arrow arrow-down"></span>
                <span class="toggle-arrow arrow-up"></span>
              </div>
            </div>

            <!-- TCCC Associate fields -->
            <div class="agency-type-fields agency-type-fields-tccc" style="display: ${formData.agencyType === 'Agency' ? 'none' : 'block'}">
              <div class="form-field">
                <label>${t('agencyName', 'Agency Name')} <span class="required">*</span></label>
                <input type="text" class="form-input" id="agencyname" name="agencyname" value="${formData.agencyName || ''}" placeholder="${t('enterAgencyName', 'Enter agency name')}" />
              </div>
              <div class="form-field">
                <label>${t('nameOfAgencyContact', 'Name of Agency Contact')} <span class="required">*</span></label>
                <input type="text" class="form-input" id="agencycontactname" name="agencycontactname" value="${formData.contactName || ''}" placeholder="${t('typeAName', 'Type a name...')}" />
              </div>
              <div class="form-field">
                <label>${t('emailAddressOfAgencyContact', 'Email Address of Agency Contact')} <span class="required">*</span></label>
                <input type="email" class="form-input" id="agencyemail" name="agencyemail" value="${formData.contactEmail || ''}" placeholder="${t('enterEmailAddress', 'Enter email address')}" />
              </div>
              <div class="form-field">
                <label>${t('phoneNumberOfAgencyContact', 'Phone Number of Agency Contact')}</label>
                <input type="tel" class="form-input" id="agencyphone" name="agencyphone" value="${formData.contactPhone || ''}" placeholder="${t('enterPhoneNumber', 'Enter phone number')}" />
              </div>
            </div>

            <!-- Agency fields (TCCC Client) -->
            <div class="agency-type-fields agency-type-fields-agency" style="display: ${formData.agencyType === 'Agency' ? 'block' : 'none'}">
              <div class="form-field">
                <label>${t('nameOfTcccClient', 'Name of TCCC Client')} <span class="required">*</span></label>
                <input type="text" class="form-input" id="tccClient" name="tccClient" value="${formData.tcccClientName || ''}" placeholder="${t('enterName', 'Enter name')}" />
              </div>
              <div class="form-field">
                <label>${t('emailAddressOfTcccClient', 'Email Address of TCCC Client')} <span class="required">*</span></label>
                <input type="email" class="form-input" id="tccEmail" name="tccEmail" value="${formData.tcccClientEmail || ''}" placeholder="${t('enterEmailAddress', 'Enter email address')}" />
              </div>
              <div class="form-field">
                <label>${t('phoneNumberOfTcccClient', 'Phone Number of TCCC Client')}</label>
                <input type="tel" class="form-input" id="tccPhone" name="tccPhone" value="${formData.tcccClientPhone || ''}" placeholder="${t('enterPhoneNumber', 'Enter phone number')}" />
              </div>
            </div>

            <!-- Contacts: who will receive files and email reminders (type-ahead) -->
            <div class="rights-extension-contacts-section">
              <div class="rights-extension-contacts-info">
                ${t('rightsExtensionContactsInfo', 'Coca-Cola Associate(s) and/or Agency user(s) who will need to receive the files and the usage rights expiration date email reminders once the rights are confirmed')}
              </div>
              <p class="rights-extension-contacts-help">
                ${t('rightsExtensionContactsHelp', 'If you are unable to find your contact(s), please reach out to')}
                <a href="mailto:assetmanagers@coca-cola.com" class="rights-extension-contacts-email">assetmanagers@coca-cola.com</a>
              </p>
              <div class="form-field rights-extension-typeahead-wrapper">
                <div class="rights-extension-typeahead-input-wrapper">
                  <img src="/icons/search.svg" alt="" class="rights-extension-typeahead-icon" aria-hidden="true" />
                  <input
                    type="text"
                    id="userSearch"
                    name="userSearch"
                    class="form-input rights-extension-typeahead-input"
                    placeholder="${t('typeAName', 'Type a name...')}"
                    autocomplete="off"
                    spellcheck="false"
                  />
                </div>
                <div id="rights-extension-typeahead-dropdown" class="rights-extension-typeahead-dropdown" role="listbox" aria-hidden="true"></div>
                <div id="rights-extension-contacts-selected" class="rights-extension-contacts-selected">
                  ${(formData.contacts || []).map((c) => `
                    <span class="rights-extension-contact-chip" data-contact-id="${(c.id || c.email || '').toString().replace(/"/g, '&quot;')}">
                      ${(c.displayName || c.name || c.email || '').toString().replace(/</g, '&lt;')}
                      <button type="button" class="rights-extension-contact-chip-remove" aria-label="${t('remove', 'Remove')}">&times;</button>
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Materials Information -->
            <div class="form-field">
              <label>
                ${t('materialsNeeded', 'Materials Needed')}
              </label>
            </div>

            <div class="form-field">
              <label>
                ${t('materialsRequiredBy', 'Materials required by')}
              </label>
              <div id="materialsrequiredby"></div>
            </div>

            <div class="form-field">
              <label>
                ${t('formatsRequired', 'Formats Required')}
              </label>
              <textarea
                class="form-textarea"
                id="materialsrequiredformats"
                name="materialsrequiredformats"
                placeholder="${t('describeFormatsRequired', 'Describe the formats required')}"
              >${formData.formatsRequired || ''}</textarea>
            </div>

            <!-- Usage Rights Required -->
            <div class="form-field">
              <label>
                ${t('usageRightsRequired', 'Usage Rights Required')}
              </label>
              <div class="usage-rights-grid">
                <div class="usage-right-item">
                  <input
                    type="checkbox"
                    id="materialsusage_checkbox_music"
                    name="materialsusage_checkbox"
                    value="music"
                    ${formData.usageRightsRequired?.music ? 'checked' : ''}
                  />
                  <label for="materialsusage_checkbox_music">${t('music', 'Music')}</label>
                </div>
                <div class="usage-right-item">
                  <input
                    type="checkbox"
                    id="materialsusage_checkbox_talent"
                    name="materialsusage_checkbox"
                    value="talent"
                    ${formData.usageRightsRequired?.talent ? 'checked' : ''}
                  />
                  <label for="materialsusage_checkbox_talent">${t('talent', 'Talent')}</label>
                </div>
                <div class="usage-right-item">
                  <input
                    type="checkbox"
                    id="materialsusage_checkbox_photographer"
                    name="materialsusage_checkbox"
                    value="photographer"
                    ${formData.usageRightsRequired?.photographer ? 'checked' : ''}
                  />
                  <label for="materialsusage_checkbox_photographer">${t('photographer', 'Photographer')}</label>
                </div>
                <div class="usage-right-item">
                  <input
                    type="checkbox"
                    id="materialsusage_checkbox_voiceover"
                    name="materialsusage_checkbox"
                    value="voiceover"
                    ${formData.usageRightsRequired?.voiceover ? 'checked' : ''}
                  />
                  <label for="materialsusage_checkbox_voiceover">${t('voiceover', 'Voiceover')}</label>
                </div>
                <div class="usage-right-item">
                  <input
                    type="checkbox"
                    id="materialsusage_checkbox_stockfootage"
                    name="materialsusage_checkbox"
                    value="stockFootage"
                    ${formData.usageRightsRequired?.stockFootage ? 'checked' : ''}
                  />
                  <label for="materialsusage_checkbox_stockfootage">${t('stockFootage', 'Stock Footage')}</label>
                </div>
              </div>
            </div>

            <!-- Additional Information -->
            <div class="form-field">
              <label>
                ${t('howDoYouIntendToAdapt', 'How do you intend to adapt these materials?')} <span class="required">*</span>
              </label>
              <textarea
                class="form-textarea"
                id="materialsadaptationsplanned"
                name="materialsadaptationsplanned"
                placeholder="${t('describeAdaptation', 'Describe how you intend to adapt these materials')}"
              >${formData.adaptationIntention || ''}</textarea>
            </div>

            <div class="form-field">
              <label>
                ${t('budgetForMarket', 'Budget For market')} <span class="required">*</span>
              </label>
              <input
                type="text"
                class="form-input"
                id="budgetformarket"
                name="budgetformarket"
                value="${formData.budgetForMarket || ''}"
                placeholder="${t('enterBudgetForMarket', 'Enter budget for market')}"
              />
            </div>

            <div class="form-field">
              <label>
                ${t('exceptionOrNotes', 'Exception or Notes')}
              </label>
              <textarea
                class="form-textarea"
                id="budgetexceptionnotes"
                name="budgetexceptionnotes"
                placeholder="${t('anyAdditionalNotes', 'Any additional notes or exceptions')}"
              >${formData.exceptionOrNotes || ''}</textarea>
            </div>

            <!-- Terms Agreement -->
            <div class="terms-agreement">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  id="tnccheckbox"
                  name="tnccheckbox"
                  ${formData.agreesToTerms ? 'checked' : ''}
                />
                ${t('iAgreeToThe', 'I agree to the')}
                <a href="#" class="terms-link">${t('termsAndConditions', 'terms and conditions')}</a>
                ${t('ofUse', 'of use.')}
              </label>
            </div>
          </div>

          <!-- Action Buttons - Outside scrolling area -->
          <div class="form-actions">
            <button
              class="back-btn secondary-button"
              data-action="back"
              type="button"
            >
              ${t('back', 'Back')}
            </button>

            <div class="form-actions-right">
              <button
                class="cancel-btn secondary-button"
                data-action="cancel"
                type="button"
              >
                ${t('cancel', 'Cancel')}
              </button>
              <button
                class="send-request-btn primary-button"
                data-action="submit-rights-extension"
                type="button"
              >
                ${t('sendRequest', 'Send Request')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default renderCartRequestRightsExtension;
