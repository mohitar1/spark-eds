/**
 * UI components for my-rights-review-details: header and section creators.
 */
import { formatDate, formatDateToGMT } from '../../scripts/rights-management/date-formatter.js';
import { ASSET_PREVIEW } from '../../scripts/rights-management/rights-utils.js';
import { localizePath } from '../../scripts/locale-utils.js';
import {
  getDisplayAssetId,
  normalizeAssetId,
  isBareUuid,
} from '../../scripts/asset-id-utils.js';
import { fetchAssetById } from '../../scripts/asset-transformers.js';
import showToast from '../../scripts/toast/toast.js';
import { createSharedDatePicker } from '../koassets-search/components/facets/date-picker-utils.js';
import { isRightsFreeAsset } from '../koassets-search/utils/reminders-api.js';
import { createDetailField } from './detail-field.js';
import {
  buildDetailFieldOptionsFromConfig,
  buildReviewFieldOptionsFromConfig,
  getSubmitterFieldsWithConfig,
  getReviewFieldMeta,
  getIntendedUsageFieldMeta,
  getMaterialsFieldMeta,
  getBudgetFieldMeta,
} from './transformers.js';
import { formatMarketsOrMedia } from '../koassets-search/utils/fadel-options-utils.js';

function getT(options) {
  return options.t || ((key, fallback) => fallback || key);
}

function getFieldKey(propertyKey = '') {
  return String(propertyKey).split('.').pop();
}

function dedupeNamedSelections(values) {
  const seen = new Set();
  const list = Array.isArray(values) ? values : [];
  return list
    .map((item) => {
      if (item && typeof item === 'object') {
        const id = item.id != null ? String(item.id).trim() : '';
        const name = item.name != null ? String(item.name).trim() : id;
        return id ? { id, name } : null;
      }
      if (item == null) return null;
      const text = String(item).trim();
      return text ? { id: text, name: text } : null;
    })
    .filter((item) => item && !seen.has(item.id) && (seen.add(item.id), true));
}

function normalizeStringArray(value) {
  let raw = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === 'string') {
    raw = value.split(',');
  }
  const seen = new Set();
  return raw
    .map((item) => String(item).trim())
    .filter((item) => item && !seen.has(item) && (seen.add(item), true));
}

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** When opts.type === 'date' and editable, inject date picker factory (same as cart-panel). */
function ensureDatePicker(opts) {
  if (opts.type === 'date' && opts.editable && !opts.datePickerFactory) {
    opts.datePickerFactory = (value, pickerOpts) => createSharedDatePicker({
      value,
      ...pickerOpts,
      ariaLabel: opts.label || 'Select date',
    });
  }
  return opts;
}

/**
 * Generate preview URL from asset ID and filename.
 */
export function buildAssetImageUrl(
  assetId,
  fileName = ASSET_PREVIEW.DEFAULT_FILENAME,
  format = ASSET_PREVIEW.DEFAULT_FORMAT,
  width = ASSET_PREVIEW.DEFAULT_WIDTH,
) {
  if (!assetId) return '';
  const cleanFileName = fileName.replace(/\.[^/.]+$/, '');
  const encodedFileName = encodeURIComponent(cleanFileName);
  return `/api/adobe/assets/${assetId}/as/${encodedFileName}.${format}?width=${width}`;
}

/**
 * Create header section. Edit button when showEditButton + onEditClick provided.
 * When editState is passed, the request title (h1) becomes editable in edit mode
 * and is included in save payload.
 */
export function createHeader(request, options = {}) {
  const {
    showEditButton = false,
    onEditClick,
    editState = null,
    t: tOpt,
  } = options;
  const t = getT({ t: tOpt });
  const header = document.createElement('div');
  header.className = 'detail-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'title-group';

  const title = document.createElement('h1');
  title.textContent = request.rightsRequestDetails?.name || 'Unnamed Request';

  const status = document.createElement('span');
  status.className = `status-badge status-${(request.rightsRequestReviewDetails?.rightsRequestStatus || '')
    .toLowerCase().replace(/\s+/g, '-')}`;
  status.textContent = request.rightsRequestReviewDetails?.rightsRequestStatus || 'Not Started';

  titleGroup.appendChild(title);
  titleGroup.appendChild(status);

  if (showEditButton && typeof onEditClick === 'function') {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'detail-header-edit-btn secondary-button';
    editBtn.textContent = t('edit', 'Edit');
    editBtn.addEventListener('click', async () => {
      if (editState) {
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'detail-header-title-input';
        titleInput.value = request.rightsRequestDetails?.name || '';
        titleInput.placeholder = t('requestTitle', 'Request title');
        title.replaceWith(titleInput);
        editState.onEnterEditMode(
          () => ({ rightsRequestDetails: { name: titleInput.value || 'Unnamed Request' } }),
          () => {
            title.textContent = titleInput.value || 'Unnamed Request';
            titleInput.replaceWith(title);
          },
        );
      }
      onEditClick();
    });
    titleGroup.appendChild(editBtn);
  }

  const metadata = document.createElement('div');
  metadata.className = 'metadata';
  metadata.innerHTML = `
    <span><strong>Request ID:</strong> ${request.rightsRequestID}</span>
    <span><strong>Created:</strong> ${formatDate(request.created)}</span>
    <span><strong>Last Modified:</strong> ${formatDate(request.lastModified)}</span>
  `;

  header.appendChild(titleGroup);
  header.appendChild(metadata);

  return header;
}

/**
 * Create submitter info section.
 * Fields come from map (Agency vs TCCC Associate); DA config only drives
 * editable, dataSource, apiEndpoint, type.
 */
export function createSubmitterSection(request, options = {}) {
  const {
    fieldConfig = [],
    editState = null,
    canEdit = false,
    t: tOpt,
  } = options;
  const t = getT({ t: tOpt });
  const section = document.createElement('div');
  section.className = 'detail-section';

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'detail-section-header';

  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = t('submitterInformation', 'Submitter Information');

  sectionHeader.appendChild(sectionTitle);

  const fields = getSubmitterFieldsWithConfig(request, t, fieldConfig);
  const hasEditableFields = fields.some((f) => f.configItem.editField);

  if (canEdit && hasEditableFields) {
    const fieldsGrid = document.createElement('div');
    fieldsGrid.className = 'fields-grid';

    const renderViewMode = () => {
      fieldsGrid.textContent = '';
      fields.forEach((field) => {
        const opts = {
          ...buildDetailFieldOptionsFromConfig(
            field.configItem,
            field.label,
            field.value,
            field.name,
          ),
          editable: false,
        };
        fieldsGrid.appendChild(createDetailField(opts));
      });
      fieldsGrid.appendChild(createDetailField({
        label: (t('submittedByLabel', 'Submitted By') || 'Submitted By').replace(/:?\s*$/, ''),
        value: request.rightsRequestSubmittedUserID,
      }));
    };

    const renderEditMode = () => {
      fieldsGrid.textContent = '';
      const editableFields = [];
      const placeholders = {
        name: t('enterName', 'Enter name'),
        contactName: t('typeAName', 'Type a name...'),
        emailAddress: t('enterEmailAddress', 'Enter email address'),
        phoneNumber: t('enterPhoneNumber', 'Enter phone number'),
      };
      fields.forEach((field) => {
        const opts = buildDetailFieldOptionsFromConfig(
          field.configItem,
          field.label,
          field.value,
          field.name,
        );
        const optsWithPlaceholder = opts.type === 'text' || opts.type === 'email' || opts.type === 'tel'
          ? { ...opts, placeholder: opts.placeholder ?? placeholders[field.propertyName] ?? '' }
          : opts;
        const fieldEl = createDetailField(optsWithPlaceholder);
        if (fieldEl) {
          if (fieldEl.root) {
            fieldsGrid.appendChild(fieldEl.root);
            if (opts.editable && fieldEl.getValue) editableFields.push(fieldEl);
          } else {
            fieldsGrid.appendChild(fieldEl);
          }
        }
      });
      fieldsGrid.appendChild(createDetailField({
        label: (t('submittedByLabel', 'Submitted By') || 'Submitted By').replace(/:?\s*$/, ''),
        value: request.rightsRequestSubmittedUserID,
      }));

      if (editState) {
        editState.onEnterEditMode(
          () => {
            const payload = {};
            editableFields.forEach((f) => {
              if (f.propertyKey) payload[f.propertyKey] = f.getValue();
            });
            return payload;
          },
          () => { renderViewMode(); },
        );
      }
    };

    renderViewMode();
    section.appendChild(fieldsGrid);

    section.insertBefore(sectionHeader, section.firstChild);
    return { section, enterEditMode: () => { renderEditMode(); } };
  }

  const fieldsGrid = document.createElement('div');
  fieldsGrid.className = 'fields-grid';
  fields.forEach((field) => {
    const opts = {
      ...buildDetailFieldOptionsFromConfig(field.configItem, field.label, field.value, field.name),
      editable: false,
    };
    fieldsGrid.appendChild(createDetailField(opts));
  });
  fieldsGrid.appendChild(createDetailField({
    label: (t('submittedByLabel', 'Submitted By') || 'Submitted By').replace(/:?\s*$/, ''),
    value: request.rightsRequestSubmittedUserID,
  }));
  section.appendChild(fieldsGrid);

  section.insertBefore(sectionHeader, section.firstChild);
  return { section, enterEditMode: null };
}

/**
 * Create review status section (configurable: status dropdown, assigned reviewer API).
 */
export function createReviewSection(request, options = {}) {
  const {
    fieldConfig = [],
    editState = null,
    canEdit = false,
    onCommentsClick = null,
    t: tOpt,
  } = options;
  const t = getT({ t: tOpt });
  const section = document.createElement('div');
  section.className = 'detail-section';

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'section-header';
  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = t('reviewStatus', 'Review Status');
  sectionHeader.appendChild(sectionTitle);

  const fieldsGrid = document.createElement('div');
  fieldsGrid.className = 'fields-grid';

  const review = request?.rightsRequestReviewDetails || {};
  const reviewInfo = request?.reviewInfo || {};
  const fieldMeta = getReviewFieldMeta(request);

  const hasConfig = Array.isArray(fieldConfig) && fieldConfig.length > 0;
  const hasEditableFields = hasConfig && fieldConfig.some((item) => item.editField);

  function renderViewMode() {
    fieldsGrid.textContent = '';
    if (hasConfig) {
      fieldConfig.forEach((item) => {
        const meta = fieldMeta[item.propertyName];
        if (!meta) return;
        const opts = buildReviewFieldOptionsFromConfig(item, meta.label, meta.value, meta.name);
        const viewOpts = { ...opts, editable: false };
        fieldsGrid.appendChild(createDetailField(viewOpts));
      });
    } else {
      fieldsGrid.appendChild(createDetailField({
        label: 'Status',
        value: review.rightsRequestStatus,
      }));
      fieldsGrid.appendChild(createDetailField({
        label: 'Assigned Reviewer',
        value: review.rightsReviewer || 'Unassigned',
      }));
      if (reviewInfo.assignedDate) {
        fieldsGrid.appendChild(createDetailField({
          label: 'Assigned Date',
          value: formatDate(reviewInfo.assignedDate),
        }));
      }
    }
    if (review.errorMessage) {
      const errorField = createDetailField({
        label: 'Error Message',
        value: review.errorMessage,
      });
      errorField.classList?.add('full-width');
      fieldsGrid.appendChild(errorField);
    }
  }

  function renderEditMode() {
    fieldsGrid.textContent = '';
    const editableFields = [];
    fieldConfig.forEach((item) => {
      const meta = fieldMeta[item.propertyName];
      if (!meta) return;
      const opts = buildReviewFieldOptionsFromConfig(item, meta.label, meta.value, meta.name);
      const field = createDetailField(opts);
      if (field) {
        if (field.root) {
          fieldsGrid.appendChild(field.root);
          if (opts.editable && field.getValue) editableFields.push(field);
        } else {
          fieldsGrid.appendChild(field);
        }
      }
    });
    if (review.errorMessage) {
      const errorField = createDetailField({
        label: 'Error Message',
        value: review.errorMessage,
      });
      errorField.classList?.add('full-width');
      fieldsGrid.appendChild(errorField);
    }

    if (editState) {
      editState.onEnterEditMode(
        () => {
          const payload = {};
          editableFields.forEach((f) => {
            if (f.propertyKey) payload[f.propertyKey] = f.getValue();
          });
          return payload;
        },
        () => { renderViewMode(); },
      );
    }
  }

  if (hasConfig) {
    renderViewMode();
  } else {
    fieldsGrid.appendChild(createDetailField({
      label: 'Status',
      value: review.rightsRequestStatus,
    }));
    fieldsGrid.appendChild(createDetailField({
      label: 'Assigned Reviewer',
      value: review.rightsReviewer || 'Unassigned',
    }));
    if (reviewInfo.assignedDate) {
      fieldsGrid.appendChild(createDetailField({
        label: 'Assigned Date',
        value: formatDate(reviewInfo.assignedDate),
      }));
    }
    if (review.errorMessage) {
      const errorField = createDetailField({
        label: 'Error Message',
        value: review.errorMessage,
      });
      errorField.classList?.add('full-width');
      fieldsGrid.appendChild(errorField);
    }
  }

  section.appendChild(fieldsGrid);
  if (canEdit && typeof onCommentsClick === 'function') {
    const commentsAction = document.createElement('div');
    commentsAction.className = 'review-comments-button-row';

    const commentsBtn = document.createElement('button');
    commentsBtn.type = 'button';
    commentsBtn.className = 'review-comments-open-button secondary-button';
    commentsBtn.textContent = t('viewComments', 'View Comments');
    commentsBtn.addEventListener('click', () => onCommentsClick(request));

    commentsAction.appendChild(commentsBtn);
    section.appendChild(commentsAction);
  }
  section.insertBefore(sectionHeader, section.firstChild);
  const enterEditMode = canEdit && hasEditableFields ? () => renderEditMode() : null;
  return { section, enterEditMode };
}

/**
 * Create assets gallery section. When editable: keep at least minLimit assets.
 */
export function createAssetsSection(request, options = {}) {
  const {
    editable = false,
    editState = null,
    minLimit = 1,
    maxLimit = 25,
    t: tOpt,
  } = options;
  const t = getT({ t: tOpt });
  const section = document.createElement('div');
  section.className = 'detail-section';

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'section-header';
  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = t('assets', 'Assets');
  sectionHeader.appendChild(sectionTitle);

  const assets = request?.rightsRequestDetails?.general?.assets || [];
  const min = Number.isFinite(Number(minLimit)) ? Math.max(0, Number(minLimit)) : 1;
  const max = Number.isFinite(Number(maxLimit))
    ? Math.max(min, Number(maxLimit))
    : 25;
  let currentAssets = [...assets];
  let isAddingAsset = false;

  const gallery = document.createElement('div');
  gallery.className = 'assets-gallery';

  const addControls = document.createElement('div');
  addControls.className = 'assets-add-controls';
  addControls.style.display = 'none';

  const addRow = document.createElement('div');
  addRow.className = 'assets-add-row';

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'detail-field-input assets-add-input';
  addInput.placeholder = t('enterAssetId', 'Enter asset ID');
  addInput.setAttribute('aria-label', t('assetId', 'Asset ID'));

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'secondary-button assets-add-btn';
  addBtn.textContent = t('addAsset', 'Add Asset');

  const addError = document.createElement('div');
  addError.className = 'assets-add-error';
  addError.style.display = 'none';

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  addControls.appendChild(addRow);
  addControls.appendChild(addError);

  function setAddError(message = '') {
    addError.textContent = message;
    addError.style.display = message ? 'block' : 'none';
  }

  function isDuplicateAsset(assetId) {
    const normalized = normalizeAssetId(assetId);
    return currentAssets.some((asset) => normalizeAssetId(asset.assetId) === normalized);
  }

  function hasReachedMaxLimit() {
    return currentAssets.length >= max;
  }

  function buildAssetCard(asset, showRemove, onRemoved) {
    const cardWrap = document.createElement('div');
    cardWrap.className = 'asset-card-wrap';
    const assetCard = document.createElement('div');
    assetCard.className = 'asset-card';

    const img = document.createElement('img');
    img.src = buildAssetImageUrl(asset.assetId, asset.name);
    img.alt = asset.name;

    const assetName = document.createElement('div');
    assetName.className = 'asset-name';
    assetName.textContent = asset.name;

    assetCard.appendChild(img);
    assetCard.appendChild(assetName);
    assetCard.style.cursor = 'pointer';
    assetCard.addEventListener('click', () => {
      const assetDetailsPath = `/asset-details?assetid=${encodeURIComponent(
        getDisplayAssetId(asset.assetId),
      )}`;
      window.open(localizePath(assetDetailsPath), '_blank');
    });

    cardWrap.appendChild(assetCard);
    if (showRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'asset-remove-btn';
      removeBtn.setAttribute('aria-label', t('removeAsset', 'Remove asset'));
      removeBtn.textContent = '\u00D7';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = currentAssets.findIndex(
          (a) => a.assetId === asset.assetId && a.name === asset.name,
        );
        if (idx >= 0 && currentAssets.length > min) {
          currentAssets.splice(idx, 1);
          onRemoved?.();
        }
      });
      cardWrap.appendChild(removeBtn);
    }
    return cardWrap;
  }

  function renderEmptyGalleryState() {
    const empty = document.createElement('p');
    empty.className = 'assets-empty-state';
    empty.textContent = t('noAssetsInRequest', 'No assets in this request.');
    gallery.appendChild(empty);
  }

  function renderViewGallery() {
    gallery.textContent = '';
    if (currentAssets.length === 0) {
      renderEmptyGalleryState();
      return;
    }
    currentAssets.forEach((asset) => {
      gallery.appendChild(buildAssetCard(asset, false, null));
    });
  }

  function renderEditGallery() {
    gallery.textContent = '';
    if (currentAssets.length === 0) {
      renderEmptyGalleryState();
      return;
    }
    const canRemove = currentAssets.length > min;
    currentAssets.forEach((asset) => {
      gallery.appendChild(buildAssetCard(asset, canRemove, renderEditGallery));
    });
  }

  async function handleAddAssetById() {
    if (isAddingAsset) return;
    const rawInput = addInput.value.trim();
    if (!rawInput) {
      setAddError(t('assetIdRequired', 'Asset ID is required.'));
      return;
    }

    const normalizedInput = normalizeAssetId(rawInput);
    const displayId = getDisplayAssetId(normalizedInput);
    if (!isBareUuid(displayId)) {
      const invalidAssetMessage = t('invalidAssetId', 'Enter a valid asset ID.');
      showToast(invalidAssetMessage, 'error');
      return;
    }

    const fullAssetId = normalizeAssetId(displayId);
    if (isDuplicateAsset(fullAssetId)) {
      setAddError(t('assetAlreadyAdded', 'Asset is already added.'));
      return;
    }
    if (hasReachedMaxLimit()) {
      const maxLimitMessage = t('maxAssetLimitReached', 'Maximum assets limit reached ({0}).')
        .replace('{0}', String(max));
      setAddError(maxLimitMessage);
      showToast(maxLimitMessage, 'info');
      return;
    }

    isAddingAsset = true;
    addBtn.disabled = true;
    const originalLabel = addBtn.textContent;
    addBtn.textContent = t('adding', 'Adding...');

    try {
      const fetchedAsset = await fetchAssetById(fullAssetId);
      const fetchedName = fetchedAsset?.name || fetchedAsset?.title || '';
      const fetchedId = normalizeAssetId(fetchedAsset?.assetId || fullAssetId);
      if (!fetchedAsset || !fetchedName) {
        setAddError(t('assetNotFound', 'Asset not found for this ID.'));
        return;
      }
      if (isRightsFreeAsset(fetchedAsset)) {
        const rightsFreeMessage = t(
          'assetAlreadyRightsFree',
          'This asset is already rights-free and cannot be added.',
        );
        setAddError(rightsFreeMessage);
        addInput.value = '';
        showToast(rightsFreeMessage, 'info');
        return;
      }
      if (isDuplicateAsset(fetchedId)) {
        setAddError(t('assetAlreadyAdded', 'Asset is already added.'));
        return;
      }
      currentAssets.push({ name: fetchedName, assetId: fetchedId });
      addInput.value = '';
      setAddError('');
      renderEditGallery();
    } catch {
      setAddError(t('assetFetchFailed', 'Failed to fetch asset details.'));
    } finally {
      isAddingAsset = false;
      addBtn.disabled = false;
      addBtn.textContent = originalLabel;
    }
  }

  addBtn.addEventListener('click', () => {
    handleAddAssetById();
  });
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAssetById();
    }
  });

  renderViewGallery();
  section.appendChild(sectionHeader);
  section.appendChild(addControls);
  section.appendChild(gallery);

  let enterEditMode = null;
  if (editable && editState) {
    enterEditMode = () => {
      currentAssets = [...assets];
      addControls.style.display = 'flex';
      addInput.value = '';
      setAddError('');
      renderEditGallery();
      editState.onEnterEditMode(
        () => ({ rightsRequestDetails: { general: { assets: [...currentAssets] } } }),
        () => {
          currentAssets = [...assets];
          addControls.style.display = 'none';
          addInput.value = '';
          setAddError('');
          renderViewGallery();
        },
      );
    };
  }

  return { section, enterEditMode };
}

/**
 * Create intended usage section (configurable via intendedUsageFieldConfig).
 */
export function createIntendedUsageSection(request, options = {}) {
  const {
    fieldConfig = [],
    editState = null,
    canEdit = false,
    t: tOpt,
  } = options;
  const t = getT({ t: tOpt });
  const section = document.createElement('div');
  section.className = 'detail-section';

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'section-header';
  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = t('intendedUsage', 'Intended Usage');
  sectionHeader.appendChild(sectionTitle);

  const fieldsGrid = document.createElement('div');
  fieldsGrid.className = 'fields-grid';

  const usage = request?.rightsRequestDetails?.intendedUsage || {};
  const fieldMeta = getIntendedUsageFieldMeta(request);

  const hasConfig = Array.isArray(fieldConfig) && fieldConfig.length > 0;
  const hasEditableFields = hasConfig && fieldConfig.some((item) => item.editField);

  function renderViewMode() {
    fieldsGrid.textContent = '';
    if (hasConfig) {
      fieldConfig.forEach((item) => {
        const meta = fieldMeta[item.propertyName];
        if (!meta) return;
        const opts = ensureDatePicker({
          ...buildDetailFieldOptionsFromConfig(item, meta.label, meta.value, meta.name),
          editable: false,
        });
        fieldsGrid.appendChild(createDetailField(opts));
      });
    } else {
      fieldsGrid.appendChild(createDetailField({
        label: 'Rights Start Date',
        value: formatDate(usage.rightsStartDate),
      }));
      fieldsGrid.appendChild(createDetailField({
        label: 'Rights End Date',
        value: formatDate(usage.rightsEndDate),
      }));
      const markets = formatMarketsOrMedia(usage.marketsCovered) || 'N/A';
      const marketField = createDetailField({ label: 'Markets Covered', value: markets });
      marketField.classList?.add('full-width');
      fieldsGrid.appendChild(marketField);
      const media = formatMarketsOrMedia(usage.mediaRights) || 'N/A';
      const mediaField = createDetailField({ label: 'Media Rights', value: media });
      mediaField.classList?.add('full-width');
      fieldsGrid.appendChild(mediaField);
    }
  }

  function renderEditMode() {
    fieldsGrid.textContent = '';
    const editableFields = [];
    const todayStart = getTodayStart();
    fieldConfig.forEach((item) => {
      const meta = fieldMeta[item.propertyName];
      if (!meta) return;
      const val = meta.rawValue !== undefined ? meta.rawValue : meta.value;
      const fieldKey = getFieldKey(item.propertyName);
      const dateConstrainedOpts = (
        fieldKey === 'rightsStartDate' || fieldKey === 'rightsEndDate'
      ) ? { minValue: todayStart } : {};
      const opts = ensureDatePicker(
        {
          ...buildDetailFieldOptionsFromConfig(item, meta.label, val, meta.name),
          ...dateConstrainedOpts,
        },
      );
      const field = createDetailField(opts);
      if (field) {
        if (field.root) {
          fieldsGrid.appendChild(field.root);
          if (opts.editable && field.getValue) editableFields.push(field);
        } else {
          fieldsGrid.appendChild(field);
        }
      }
    });
    if (editState) {
      editState.onEnterEditMode(
        () => {
          const payload = {};
          const dateKeys = ['rightsStartDate', 'rightsEndDate'];
          editableFields.forEach((f) => {
            if (!f.propertyKey) return;
            const key = getFieldKey(f.propertyKey);
            const val = f.getValue();
            if (dateKeys.includes(key) && val) {
              payload[key] = formatDateToGMT(val) || val;
            } else if ((key === 'marketsCovered' || key === 'mediaRights') && typeof f.getSelectedLabels === 'function') {
              payload[key] = dedupeNamedSelections(f.getSelectedLabels());
            } else if ((key === 'marketsCovered' || key === 'mediaRights') && typeof f.getSelectedLabel === 'function') {
              payload[key] = dedupeNamedSelections([{
                id: String(val),
                name: f.getSelectedLabel() || val,
              }]);
            } else {
              payload[key] = val;
            }
          });
          return { rightsRequestDetails: { intendedUsage: payload } };
        },
        () => { renderViewMode(); },
      );
    }
  }

  if (hasConfig) {
    renderViewMode();
  } else {
    renderViewMode();
  }

  section.appendChild(fieldsGrid);
  section.insertBefore(sectionHeader, section.firstChild);
  const enterEditMode = canEdit && hasEditableFields ? () => renderEditMode() : null;
  return { section, enterEditMode };
}

/**
 * Create materials needed section (configurable via materialsFieldConfig).
 */
export function createMaterialsSection(request, options = {}) {
  const {
    fieldConfig = [],
    editState = null,
    canEdit = false,
    t: tOpt,
  } = options;
  const t = getT({ t: tOpt });
  const section = document.createElement('div');
  section.className = 'detail-section';

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'section-header';
  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = t('materialsNeeded', 'Materials Needed');
  sectionHeader.appendChild(sectionTitle);

  const fieldsGrid = document.createElement('div');
  fieldsGrid.className = 'fields-grid';

  const materials = request?.rightsRequestDetails?.materialsNeeded || {};
  const fieldMeta = getMaterialsFieldMeta(request);

  const hasConfig = Array.isArray(fieldConfig) && fieldConfig.length > 0;
  const hasEditableFields = hasConfig && fieldConfig.some((item) => item.editField);

  function renderViewMode() {
    fieldsGrid.textContent = '';
    if (hasConfig) {
      fieldConfig.forEach((item) => {
        const meta = fieldMeta[item.propertyName];
        if (!meta) return;
        const opts = ensureDatePicker({
          ...buildDetailFieldOptionsFromConfig(item, meta.label, meta.value, meta.name),
          editable: false,
        });
        fieldsGrid.appendChild(createDetailField(opts));
      });
    } else {
      fieldsGrid.appendChild(createDetailField({
        label: 'Date Required By',
        value: formatDate(materials.dateRequiredBy),
      }));
      fieldsGrid.appendChild(createDetailField({
        label: 'Formats Required',
        value: materials.formatsRequiredBy,
      }));
      const usageRights = Array.isArray(materials.usageRightsRequired)
        ? materials.usageRightsRequired.join(', ')
        : (materials.usageRightsRequired ?? 'N/A');
      const rightsField = createDetailField({
        label: 'Usage Rights Required',
        value: usageRights,
      });
      rightsField.classList?.add('full-width');
      fieldsGrid.appendChild(rightsField);
      const adaptations = createDetailField({
        label: 'Planned Adaptations',
        value: materials.plannedAdaptations,
      });
      adaptations.classList?.add('full-width');
      fieldsGrid.appendChild(adaptations);
    }
  }

  function renderEditMode() {
    fieldsGrid.textContent = '';
    const editableFields = [];
    fieldConfig.forEach((item) => {
      const meta = fieldMeta[item.propertyName];
      if (!meta) return;
      const val = meta.rawValue !== undefined ? meta.rawValue : meta.value;
      const opts = ensureDatePicker(
        buildDetailFieldOptionsFromConfig(item, meta.label, val, meta.name),
      );
      const field = createDetailField(opts);
      if (field) {
        if (field.root) {
          fieldsGrid.appendChild(field.root);
          if (opts.editable && field.getValue) editableFields.push(field);
        } else {
          fieldsGrid.appendChild(field);
        }
      }
    });
    if (editState) {
      editState.onEnterEditMode(
        () => {
          const payload = {};
          editableFields.forEach((f) => {
            if (!f.propertyKey) return;
            const fieldKey = getFieldKey(f.propertyKey);
            const val = f.getValue();
            if (fieldKey === 'dateRequiredBy' && val) {
              payload[fieldKey] = formatDateToGMT(val) || val;
            } else if (fieldKey === 'usageRightsRequired') {
              payload[fieldKey] = normalizeStringArray(val);
            } else {
              payload[fieldKey] = val;
            }
          });
          return { rightsRequestDetails: { materialsNeeded: payload } };
        },
        () => { renderViewMode(); },
      );
    }
  }

  if (hasConfig) {
    renderViewMode();
  } else {
    renderViewMode();
  }

  section.appendChild(fieldsGrid);
  section.insertBefore(sectionHeader, section.firstChild);
  const enterEditMode = canEdit && hasEditableFields ? () => renderEditMode() : null;
  return { section, enterEditMode };
}

/**
 * Create budget section (configurable via budgetFieldConfig).
 * Payload: rightsRequestDetails.budgetForUsage.
 * { budgetForMarket, exceptionsOrNotes, quoteDetails }.
 */
export function createBudgetSection(request, options = {}) {
  const {
    fieldConfig = [],
    editState = null,
    canEdit = false,
    isRightsManager = false,
    t: tOpt,
  } = options;
  const t = getT({ t: tOpt });
  const section = document.createElement('div');
  section.className = 'detail-section';

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'section-header';
  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = t('budgetInformation', 'Budget Information');
  sectionHeader.appendChild(sectionTitle);

  const fieldsGrid = document.createElement('div');
  fieldsGrid.className = 'fields-grid';

  const budget = request?.rightsRequestDetails?.budgetForUsage || {};
  const fieldMeta = getBudgetFieldMeta(request, t);
  const hasConfig = Array.isArray(fieldConfig) && fieldConfig.length > 0;
  const quoteConfigItem = hasConfig
    ? fieldConfig.find((item) => getFieldKey(item.propertyName) === 'quoteDetails') || null
    : null;
  const visibleFieldConfig = hasConfig
    ? fieldConfig.filter((item) => getFieldKey(item.propertyName) !== 'quoteDetails')
    : [];
  const hasEditableFields = (
    hasConfig
    && (visibleFieldConfig.some((item) => item.editField)
      || (isRightsManager && !!quoteConfigItem?.editField))
  );

  function appendQuoteDetailsField(editMode = false, editableFields = []) {
    if (!isRightsManager) return;
    const quoteMeta = fieldMeta.quoteDetails;
    if (!quoteMeta) return;
    const quoteOpts = quoteConfigItem
      ? buildDetailFieldOptionsFromConfig(
        quoteConfigItem,
        quoteMeta.label,
        quoteMeta.value,
        quoteMeta.name,
      )
      : {
        label: quoteMeta.label,
        value: quoteMeta.value,
        editable: false,
      };

    if (editMode) {
      const quoteField = createDetailField(quoteOpts);
      if (!quoteField) return;
      if (quoteField.root) {
        quoteField.root.classList?.add('full-width');
        fieldsGrid.appendChild(quoteField.root);
        if (quoteOpts.editable && quoteField.getValue) editableFields.push(quoteField);
      } else {
        quoteField.classList?.add('full-width');
        fieldsGrid.appendChild(quoteField);
      }
      return;
    }

    const quoteViewField = createDetailField({
      label: quoteMeta.label,
      value: quoteMeta.value,
    });
    quoteViewField.classList?.add('full-width');
    fieldsGrid.appendChild(quoteViewField);
  }

  function renderViewMode() {
    fieldsGrid.textContent = '';
    if (hasConfig) {
      visibleFieldConfig.forEach((item) => {
        const meta = fieldMeta[item.propertyName];
        if (!meta) return;
        const opts = {
          ...buildDetailFieldOptionsFromConfig(item, meta.label, meta.value, meta.name),
          editable: false,
        };
        fieldsGrid.appendChild(createDetailField(opts));
      });
      appendQuoteDetailsField(false);
    } else {
      fieldsGrid.appendChild(createDetailField({
        label: t('budgetForMarket', 'Budget for Market'),
        value: budget.budgetForMarket ?? '',
      }));
      const notes = createDetailField({
        label: t('exceptionsOrNotes', 'Exceptions/Notes'),
        value: budget.exceptionsOrNotes ?? '',
      });
      notes.classList?.add('full-width');
      fieldsGrid.appendChild(notes);
      appendQuoteDetailsField(false);
    }
  }

  function renderEditMode() {
    fieldsGrid.textContent = '';
    const editableFields = [];
    visibleFieldConfig.forEach((item) => {
      const meta = fieldMeta[item.propertyName];
      if (!meta) return;
      const opts = buildDetailFieldOptionsFromConfig(item, meta.label, meta.value, meta.name);
      const field = createDetailField(opts);
      if (field) {
        if (field.root) {
          fieldsGrid.appendChild(field.root);
          if (opts.editable && field.getValue) editableFields.push(field);
        } else {
          fieldsGrid.appendChild(field);
        }
      }
    });
    appendQuoteDetailsField(true, editableFields);
    if (editState) {
      editState.onEnterEditMode(
        () => {
          const payload = {};
          editableFields.forEach((f) => {
            if (f.propertyKey) payload[f.propertyKey] = f.getValue();
          });
          return { rightsRequestDetails: { budgetForUsage: payload } };
        },
        () => { renderViewMode(); },
      );
    }
  }

  if (hasConfig) {
    renderViewMode();
  } else {
    renderViewMode();
  }

  section.appendChild(fieldsGrid);
  section.insertBefore(sectionHeader, section.firstChild);
  const enterEditMode = canEdit && hasEditableFields ? () => renderEditMode() : null;
  return { section, enterEditMode };
}
