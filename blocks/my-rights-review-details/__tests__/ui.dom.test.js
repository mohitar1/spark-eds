import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

const {
  formatDateMock,
  localizePathMock,
  getDisplayAssetIdMock,
  normalizeAssetIdMock,
  isBareUuidMock,
  fetchAssetByIdMock,
  showToastMock,
  isRightsFreeAssetMock,
} = vi.hoisted(() => ({
  formatDateMock: vi.fn((value) => `fmt:${value}`),
  localizePathMock: vi.fn((path) => `/loc${path}`),
  getDisplayAssetIdMock: vi.fn((id) => String(id).replace('urn:aaid:aem:', '')),
  normalizeAssetIdMock: vi.fn((id) => {
    const value = String(id || '').trim();
    if (!value) return value;
    return value.startsWith('urn:aaid:aem:') ? value : `urn:aaid:aem:${value}`;
  }),
  isBareUuidMock: vi.fn(
    (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(String(value || '')),
  ),
  fetchAssetByIdMock: vi.fn(),
  showToastMock: vi.fn(),
  isRightsFreeAssetMock: vi.fn(() => false),
}));

vi.mock('../../../scripts/rights-management/date-formatter.js', () => ({
  formatDate: formatDateMock,
}));

vi.mock('../../../scripts/rights-management/rights-utils.js', () => ({
  ASSET_PREVIEW: {
    DEFAULT_WIDTH: 350,
    DEFAULT_FORMAT: 'jpg',
    DEFAULT_FILENAME: 'thumbnail',
  },
}));

vi.mock('../../../scripts/locale-utils.js', () => ({
  localizePath: localizePathMock,
}));

vi.mock('../../../scripts/asset-id-utils.js', () => ({
  getDisplayAssetId: getDisplayAssetIdMock,
  normalizeAssetId: normalizeAssetIdMock,
  isBareUuid: isBareUuidMock,
}));

vi.mock('../../../scripts/asset-transformers.js', () => ({
  fetchAssetById: fetchAssetByIdMock,
}));

vi.mock('../../../scripts/toast/toast.js', () => ({
  default: showToastMock,
}));

vi.mock('../../koassets-search/utils/reminders-api.js', () => ({
  isRightsFreeAsset: isRightsFreeAssetMock,
}));

vi.mock('../../koassets-search/components/facets/my-date-picker.js', () => ({
  createDatePicker: vi.fn(),
}));

vi.mock('../detail-field.js', () => ({
  createDetailField: vi.fn((opts) => {
    const el = document.createElement('div');
    el.className = 'mock-detail-field';
    el.textContent = `${opts.label}:${opts.value ?? ''}`;
    if (!opts.editable) return el;
    return {
      root: el,
      propertyKey: opts.propertyKey,
      getValue: () => opts.value ?? '',
      getSelectedLabel: () => opts.label ?? '',
    };
  }),
}));

vi.mock('../transformers.js', () => ({
  buildDetailFieldOptionsFromConfig: vi.fn((item, label, value) => ({
    editable: !!item.editField,
    propertyKey: item.propertyName,
    label,
    value,
    type: item.type || 'text',
  })),
  buildReviewFieldOptionsFromConfig: vi.fn((item, label, value) => ({
    editable: !!item.editField,
    propertyKey: item.propertyName,
    label,
    value,
    type: item.type || 'text',
  })),
  getSubmitterFieldsWithConfig: vi.fn(() => []),
  getReviewFieldMeta: vi.fn(() => ({})),
  getIntendedUsageFieldMeta: vi.fn(() => ({})),
  getMaterialsFieldMeta: vi.fn(() => ({})),
  getBudgetFieldMeta: vi.fn(() => ({})),
}));

vi.mock('../../koassets-search/utils/fadel-options-utils.js', () => ({
  formatMarketsOrMedia: vi.fn((val) => String(val || '')),
}));

let buildAssetImageUrl;
let createHeader;
let createAssetsSection;
let createIntendedUsageSection;
let createBudgetSection;
let createDetailFieldMock;
let getIntendedUsageFieldMetaMock;
let getBudgetFieldMetaMock;

describe('my-rights-review-details/ui', () => {
  beforeAll(async () => {
    ({
      buildAssetImageUrl,
      createHeader,
      createAssetsSection,
      createIntendedUsageSection,
      createBudgetSection,
    } = await import('../ui.js'));
    ({ createDetailField: createDetailFieldMock } = await import('../detail-field.js'));
    ({
      getIntendedUsageFieldMeta: getIntendedUsageFieldMetaMock,
      getBudgetFieldMeta: getBudgetFieldMetaMock,
    } = await import('../transformers.js'));
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    formatDateMock.mockClear();
    localizePathMock.mockClear();
    getDisplayAssetIdMock.mockClear();
    normalizeAssetIdMock.mockClear();
    isBareUuidMock.mockClear();
    fetchAssetByIdMock.mockClear();
    showToastMock.mockClear();
    isRightsFreeAssetMock.mockClear();
    createDetailFieldMock.mockClear();
    getIntendedUsageFieldMetaMock.mockClear();
    getBudgetFieldMetaMock.mockClear();
    vi.spyOn(window, 'open').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds preview image url with encoded filename and defaults', () => {
    const url = buildAssetImageUrl('asset-123', 'Brand Shot.png');
    expect(url).toBe('/api/adobe/assets/asset-123/as/Brand%20Shot.jpg?width=350');
  });

  it('creates header with status badge and metadata', () => {
    const request = {
      rightsRequestID: 'REQ-001',
      created: '2026-01-01',
      lastModified: '2026-01-02',
      rightsRequestDetails: { name: 'Review Request' },
      rightsRequestReviewDetails: { rightsRequestStatus: 'In Review' },
    };

    const header = createHeader(request, { t: (key, fallback) => fallback || key });

    expect(header.querySelector('h1').textContent).toBe('Review Request');
    expect(header.querySelector('.status-badge').textContent).toBe('In Review');
    expect(header.querySelector('.status-badge').className).toContain('status-in-review');
    expect(header.querySelector('.metadata').textContent).toContain('fmt:2026-01-01');
    expect(header.querySelector('.metadata').textContent).toContain('fmt:2026-01-02');
  });

  it('supports header title edit mode and save payload generation', async () => {
    const onEditClick = vi.fn();
    const editState = { onEnterEditMode: vi.fn() };
    const request = {
      rightsRequestID: 'REQ-001',
      created: '2026-01-01',
      lastModified: '2026-01-02',
      rightsRequestDetails: { name: 'Original' },
      rightsRequestReviewDetails: { rightsRequestStatus: 'Not Started' },
    };

    const header = createHeader(request, {
      showEditButton: true,
      onEditClick,
      editState,
      t: (key, fallback) => fallback || key,
    });

    const button = header.querySelector('.detail-header-edit-btn');
    button.click();
    await Promise.resolve();

    expect(onEditClick).toHaveBeenCalledTimes(1);
    expect(editState.onEnterEditMode).toHaveBeenCalledTimes(1);

    const titleInput = header.querySelector('.detail-header-title-input');
    titleInput.value = 'Updated Name';

    const getPayload = editState.onEnterEditMode.mock.calls[0][0];
    const onExit = editState.onEnterEditMode.mock.calls[0][1];
    expect(getPayload()).toEqual({
      rightsRequestDetails: { name: 'Updated Name' },
    });

    onExit();
    expect(header.querySelector('h1').textContent).toBe('Updated Name');
  });

  it('renders empty assets state when request has no assets', () => {
    const result = createAssetsSection(
      { rightsRequestDetails: { general: { assets: [] } } },
      { t: (key, fallback) => fallback || key },
    );

    expect(result.enterEditMode).toBeNull();
    expect(result.section.querySelector('p').textContent).toBe('No assets in this request.');
  });

  it('opens localized asset details when an asset card is clicked', () => {
    const result = createAssetsSection(
      {
        rightsRequestDetails: {
          general: {
            assets: [{ assetId: 'urn:aaid:aem:123', name: 'hero.png' }],
          },
        },
      },
      { t: (key, fallback) => fallback || key },
    );

    result.section.querySelector('.asset-card').click();

    expect(getDisplayAssetIdMock).toHaveBeenCalledWith('urn:aaid:aem:123');
    expect(localizePathMock).toHaveBeenCalledWith('/asset-details?assetid=123');
    expect(window.open).toHaveBeenCalledWith('/loc/asset-details?assetid=123', '_blank');
  });

  it('updates editable asset payload when removing assets above min limit', () => {
    const editState = { onEnterEditMode: vi.fn() };
    const request = {
      rightsRequestDetails: {
        general: {
          assets: [
            { assetId: 'a1', name: 'one.png' },
            { assetId: 'a2', name: 'two.png' },
          ],
        },
      },
    };

    const result = createAssetsSection(request, {
      editable: true,
      editState,
      minLimit: 1,
      t: (key, fallback) => fallback || key,
    });

    result.enterEditMode();
    const removeBtn = result.section.querySelector('.asset-remove-btn');
    expect(removeBtn).toBeTruthy();
    removeBtn.click();

    const getPayload = editState.onEnterEditMode.mock.calls[0][0];
    const payload = getPayload();
    expect(payload.rightsRequestDetails.general.assets).toEqual([
      { assetId: 'a2', name: 'two.png' },
    ]);
  });

  it('does not remove assets when min limit has been reached', () => {
    const editState = { onEnterEditMode: vi.fn() };
    const request = {
      rightsRequestDetails: {
        general: {
          assets: [
            { assetId: 'a1', name: 'one.png' },
            { assetId: 'a2', name: 'two.png' },
          ],
        },
      },
    };

    const result = createAssetsSection(request, {
      editable: true,
      editState,
      minLimit: 2,
      t: (key, fallback) => fallback || key,
    });

    result.enterEditMode();
    const removeBtn = result.section.querySelector('.asset-remove-btn');
    expect(removeBtn).toBeNull();

    const getPayload = editState.onEnterEditMode.mock.calls[0][0];
    const payload = getPayload();
    expect(payload.rightsRequestDetails.general.assets).toHaveLength(2);
  });

  it('adds asset by ID and saves prefixed assetId with fetched name', async () => {
    const editState = { onEnterEditMode: vi.fn() };
    const request = {
      rightsRequestDetails: {
        general: {
          assets: [{ assetId: 'urn:aaid:aem:a1', name: 'one.png' }],
        },
      },
    };
    fetchAssetByIdMock.mockResolvedValue({
      assetId: 'urn:aaid:aem:fcd7f85e-c833-4d77-b7a2-6fcde59a4159',
      name: 'P6416_J78429_NA_2026_Coke_WinterOlympics_StaticDisplay_970x250_frCA.zip',
    });

    const result = createAssetsSection(request, {
      editable: true,
      editState,
      minLimit: 1,
      t: (key, fallback) => fallback || key,
    });

    result.enterEditMode();
    const input = result.section.querySelector('.assets-add-input');
    const addBtn = result.section.querySelector('.assets-add-btn');
    input.value = 'fcd7f85e-c833-4d77-b7a2-6fcde59a4159';
    addBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchAssetByIdMock).toHaveBeenCalledWith(
      'urn:aaid:aem:fcd7f85e-c833-4d77-b7a2-6fcde59a4159',
    );

    const getPayload = editState.onEnterEditMode.mock.calls[0][0];
    expect(getPayload()).toEqual({
      rightsRequestDetails: {
        general: {
          assets: [
            { assetId: 'urn:aaid:aem:a1', name: 'one.png' },
            {
              assetId: 'urn:aaid:aem:fcd7f85e-c833-4d77-b7a2-6fcde59a4159',
              name: 'P6416_J78429_NA_2026_Coke_WinterOlympics_StaticDisplay_970x250_frCA.zip',
            },
          ],
        },
      },
    });
  });

  it('shows an error and skips API call when adding a duplicate asset ID', async () => {
    const editState = { onEnterEditMode: vi.fn() };
    const request = {
      rightsRequestDetails: {
        general: {
          assets: [
            {
              assetId: 'urn:aaid:aem:fcd7f85e-c833-4d77-b7a2-6fcde59a4159',
              name: 'existing.zip',
            },
          ],
        },
      },
    };

    const result = createAssetsSection(request, {
      editable: true,
      editState,
      minLimit: 1,
      t: (key, fallback) => fallback || key,
    });

    result.enterEditMode();
    const input = result.section.querySelector('.assets-add-input');
    const addBtn = result.section.querySelector('.assets-add-btn');
    input.value = 'fcd7f85e-c833-4d77-b7a2-6fcde59a4159';
    addBtn.click();
    await Promise.resolve();

    expect(fetchAssetByIdMock).not.toHaveBeenCalled();
    expect(result.section.querySelector('.assets-add-error').textContent)
      .toContain('already added');
  });

  it('shows error toast when asset ID format is invalid', async () => {
    const editState = { onEnterEditMode: vi.fn() };
    const result = createAssetsSection(
      {
        rightsRequestDetails: {
          general: {
            assets: [{ assetId: 'urn:aaid:aem:a1', name: 'one.png' }],
          },
        },
      },
      {
        editable: true,
        editState,
        minLimit: 1,
        t: (key, fallback) => fallback || key,
      },
    );

    result.enterEditMode();
    const input = result.section.querySelector('.assets-add-input');
    const addBtn = result.section.querySelector('.assets-add-btn');
    input.value = 'not-a-valid-id';
    addBtn.click();
    await Promise.resolve();

    expect(fetchAssetByIdMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('Enter a valid asset ID.', 'error');
    expect(result.section.querySelector('.assets-add-error').textContent).toBe('');
  });

  it('shows info toast and clears input when asset is rights-free', async () => {
    const editState = { onEnterEditMode: vi.fn() };
    fetchAssetByIdMock.mockResolvedValue({
      assetId: 'urn:aaid:aem:abc2f85e-c833-4d77-b7a2-6fcde59a4159',
      name: 'rights-free.zip',
      readyToUse: 'yes',
    });
    isRightsFreeAssetMock.mockReturnValue(true);

    const result = createAssetsSection(
      {
        rightsRequestDetails: {
          general: {
            assets: [{ assetId: 'urn:aaid:aem:a1', name: 'one.png' }],
          },
        },
      },
      {
        editable: true,
        editState,
        minLimit: 1,
        t: (key, fallback) => fallback || key,
      },
    );

    result.enterEditMode();
    const input = result.section.querySelector('.assets-add-input');
    const addBtn = result.section.querySelector('.assets-add-btn');
    input.value = 'abc2f85e-c833-4d77-b7a2-6fcde59a4159';
    addBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(showToastMock).toHaveBeenCalledWith(
      'This asset is already rights-free and cannot be added.',
      'info',
    );
    expect(input.value).toBe('');

    const getPayload = editState.onEnterEditMode.mock.calls[0][0];
    expect(getPayload().rightsRequestDetails.general.assets).toEqual([
      { assetId: 'urn:aaid:aem:a1', name: 'one.png' },
    ]);
  });

  it('enforces max asset limit and does not call fetch once limit is reached', async () => {
    const editState = { onEnterEditMode: vi.fn() };
    const result = createAssetsSection(
      {
        rightsRequestDetails: {
          general: {
            assets: [
              { assetId: 'urn:aaid:aem:a1', name: 'one.png' },
              { assetId: 'urn:aaid:aem:a2', name: 'two.png' },
            ],
          },
        },
      },
      {
        editable: true,
        editState,
        minLimit: 1,
        maxLimit: 2,
        t: (key, fallback) => fallback || key,
      },
    );

    result.enterEditMode();
    const input = result.section.querySelector('.assets-add-input');
    const addBtn = result.section.querySelector('.assets-add-btn');
    input.value = 'abc3f85e-c833-4d77-b7a2-6fcde59a4159';
    addBtn.click();
    await Promise.resolve();

    expect(fetchAssetByIdMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith('Maximum assets limit reached (2).', 'info');
  });

  it('sets min date as today for rights start/end date edit fields', () => {
    getIntendedUsageFieldMetaMock.mockReturnValue({
      rightsStartDate: {
        label: 'Rights Start Date',
        value: 'fmt:2026-01-01',
        rawValue: '2026-01-01',
        name: 'intendedUsage.rightsStartDate',
      },
      rightsEndDate: {
        label: 'Rights End Date',
        value: 'fmt:2026-02-01',
        rawValue: '2026-02-01',
        name: 'intendedUsage.rightsEndDate',
      },
    });

    const editState = { onEnterEditMode: vi.fn() };
    const section = createIntendedUsageSection(
      {},
      {
        fieldConfig: [
          { propertyName: 'rightsStartDate', editField: true, type: 'date' },
          { propertyName: 'rightsEndDate', editField: true, type: 'date' },
        ],
        canEdit: true,
        editState,
        t: (key, fallback) => fallback || key,
      },
    );

    section.enterEditMode();

    const editableDateCalls = createDetailFieldMock.mock.calls
      .map(([opts]) => opts)
      .filter((opts) => opts.editable && opts.type === 'date');

    expect(editableDateCalls).toHaveLength(2);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    editableDateCalls.forEach((opts) => {
      expect(opts.minValue).toBeInstanceOf(Date);
      expect(opts.minValue.getFullYear()).toBe(todayStart.getFullYear());
      expect(opts.minValue.getMonth()).toBe(todayStart.getMonth());
      expect(opts.minValue.getDate()).toBe(todayStart.getDate());
    });
  });

  it('shows quote details for rights managers in view mode even when omitted in config', () => {
    const request = {
      rightsRequestDetails: {
        budgetForUsage: {
          budgetForMarket: '1000',
          quoteDetails: 'Quote ABC',
        },
      },
    };
    getBudgetFieldMetaMock.mockReturnValue({
      budgetForMarket: {
        label: 'Budget for Market',
        value: '1000',
        name: 'budgetForUsage.budgetForMarket',
      },
      quoteDetails: {
        label: 'Quote Details',
        value: 'Quote ABC',
        name: 'budgetForUsage.quoteDetails',
      },
    });

    const managerResult = createBudgetSection(request, {
      fieldConfig: [
        { propertyName: 'budgetForMarket', editField: false },
      ],
      canEdit: false,
      isRightsManager: true,
      t: (key, fallback) => fallback || key,
    });

    const nonManagerResult = createBudgetSection(request, {
      fieldConfig: [
        { propertyName: 'budgetForMarket', editField: false },
      ],
      canEdit: false,
      isRightsManager: false,
      t: (key, fallback) => fallback || key,
    });

    expect(managerResult.section.textContent).toContain('Quote Details:Quote ABC');
    expect(nonManagerResult.section.textContent).not.toContain('Quote Details:Quote ABC');
  });

  it('keeps quote details read-only in edit mode when quoteDetails is missing in config', () => {
    const request = {
      rightsRequestDetails: {
        budgetForUsage: {
          budgetForMarket: '1000',
          quoteDetails: 'Quote ABC',
        },
      },
    };
    getBudgetFieldMetaMock.mockReturnValue({
      budgetForMarket: {
        label: 'Budget for Market',
        value: '1000',
        name: 'budgetForUsage.budgetForMarket',
      },
      quoteDetails: {
        label: 'Quote Details',
        value: 'Quote ABC',
        name: 'budgetForUsage.quoteDetails',
      },
    });

    const editState = { onEnterEditMode: vi.fn() };
    const result = createBudgetSection(request, {
      fieldConfig: [{ propertyName: 'budgetForMarket', editField: true }],
      editState,
      canEdit: true,
      isRightsManager: true,
      t: (key, fallback) => fallback || key,
    });

    result.enterEditMode();

    const quoteEditCall = createDetailFieldMock.mock.calls
      .map(([opts]) => opts)
      .find((opts) => opts.label === 'Quote Details' && opts.editable === true);

    expect(quoteEditCall).toBeUndefined();
    expect(result.section.textContent).toContain('Quote Details:Quote ABC');
  });

  it('includes quote details in editable payload when configured', () => {
    const request = {
      rightsRequestDetails: {
        budgetForUsage: {
          quoteDetails: 'Quote ABC',
        },
      },
    };
    getBudgetFieldMetaMock.mockReturnValue({
      quoteDetails: {
        label: 'Quote Details',
        value: 'Quote ABC',
        name: 'budgetForUsage.quoteDetails',
      },
    });

    const editState = { onEnterEditMode: vi.fn() };
    const result = createBudgetSection(request, {
      fieldConfig: [{ propertyName: 'quoteDetails', editField: true, type: 'textarea' }],
      editState,
      canEdit: true,
      isRightsManager: true,
      t: (key, fallback) => fallback || key,
    });

    expect(typeof result.enterEditMode).toBe('function');
    result.enterEditMode();

    const getPayload = editState.onEnterEditMode.mock.calls[0][0];
    expect(getPayload()).toEqual({
      rightsRequestDetails: { budgetForUsage: { quoteDetails: 'Quote ABC' } },
    });
  });
});
