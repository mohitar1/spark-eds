import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

import {
  createDetailField,
} from '../detail-field.js';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('my-rights-review-details/detail-field', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders read-only field and falls back to N/A', () => {
    const field = createDetailField({ label: 'Name', value: '' });

    expect(field.querySelector('.detail-label').textContent).toBe('Name');
    expect(field.querySelector('.detail-value').textContent).toBe('N/A');
  });

  it('renders editable text input with getter/setter and property key', () => {
    const field = createDetailField({
      label: 'Email',
      value: 'old@example.com',
      editable: true,
      type: 'email',
      propertyKey: 'associateAgency.emailAddress',
      name: 'emailAddress',
    });

    const input = field.root.querySelector('input');
    expect(input.type).toBe('email');
    expect(field.propertyKey).toBe('associateAgency.emailAddress');
    expect(field.getValue()).toBe('old@example.com');

    field.setValue('new@example.com');
    expect(field.getValue()).toBe('new@example.com');
  });

  it('renders textarea input correctly', () => {
    const field = createDetailField({
      label: 'Notes',
      value: 'Initial note',
      editable: true,
      type: 'textarea',
      placeholder: 'Enter notes',
      required: true,
    });

    const textarea = field.root.querySelector('textarea');
    expect(textarea).toBeTruthy();
    expect(textarea.placeholder).toBe('Enter notes');
    expect(textarea.required).toBe(true);
    expect(field.getValue()).toBe('Initial note');
  });

  it('parses and formats date values for editable date fields', () => {
    const field = createDetailField({
      label: 'Rights Start Date',
      editable: true,
      type: 'date',
      value: { year: 2026, month: 3, day: 5 },
      minValue: '2026-03-01',
      maxValue: '2026-03-31',
    });

    const input = field.root.querySelector('input[type="date"]');
    expect(input.value).toBe('2026-03-05');
    expect(input.min).toBe('2026-03-01');
    expect(input.max).toBe('2026-03-31');

    field.setValue('2026-03-08');
    expect(field.getValue()).toBe('2026-03-08');
  });

  it('uses datePickerFactory when provided for editable date fields', async () => {
    let onChange;
    const pickerEl = document.createElement('div');
    pickerEl.className = 'custom-date-picker';
    pickerEl.setValue = vi.fn();

    const datePickerFactory = vi.fn(async (_value, pickerOpts) => {
      onChange = pickerOpts.onChange;
      return pickerEl;
    });

    const field = createDetailField({
      label: 'Date Required By',
      editable: true,
      type: 'date',
      value: '2026-03-05',
      minValue: '2026-03-01',
      maxValue: '2026-03-31',
      datePickerFactory,
    });

    await flushPromises();

    expect(datePickerFactory).toHaveBeenCalledTimes(1);
    expect(datePickerFactory).toHaveBeenCalledWith(
      expect.any(Date),
      expect.objectContaining({
        minValue: expect.any(Date),
        maxValue: expect.any(Date),
      }),
    );
    expect(field.root.querySelector('.custom-date-picker')).toBeTruthy();
    expect(field.getValue()).toBe('2026-03-05');

    onChange(new Date(2026, 2, 9));
    expect(field.getValue()).toBe('2026-03-09');

    field.setValue('2026-03-10');
    expect(pickerEl.setValue).toHaveBeenCalled();
    expect(field.getValue()).toBe('2026-03-10');
  });

  it('renders static select options and exposes selected label', () => {
    const field = createDetailField({
      label: 'Status',
      value: 'review',
      editable: true,
      type: 'select',
      options: [
        { value: 'new', text: 'New' },
        { value: 'review', text: 'In Review' },
      ],
    });

    expect(field.getValue()).toBe('review');
    expect(field.getSelectedLabel()).toBe('In Review');
    field.setValue('new');
    expect(field.getSelectedLabel()).toBe('New');
  });

  it('returns deduplicated values/labels for multi-select options', () => {
    const field = createDetailField({
      label: 'Markets',
      editable: true,
      type: 'select',
      multiple: true,
      value: ['us', 'us', 'ca'],
      options: [
        { value: 'us', text: 'United States' },
        { value: 'ca', text: 'Canada' },
        { value: 'us', text: 'United States Duplicate' },
      ],
    });

    const values = field.getValue();
    expect(values).toEqual(['us', 'ca']);
    expect(field.getSelectedLabels()).toEqual([
      { id: 'us', name: 'United States' },
      { id: 'ca', name: 'Canada' },
    ]);
  });

  it('toggles multi-select options with checkbox clicks', () => {
    const field = createDetailField({
      label: 'Markets',
      editable: true,
      type: 'select',
      multiple: true,
      options: [
        { value: 'us', text: 'United States' },
        { value: 'ca', text: 'Canada' },
      ],
    });

    const usInput = field.root.querySelector('input[type="checkbox"][value="us"]');
    const caInput = field.root.querySelector('input[type="checkbox"][value="ca"]');

    usInput.checked = true;
    usInput.dispatchEvent(new Event('change', { bubbles: true }));
    caInput.checked = true;
    caInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(field.getValue()).toEqual(['us', 'ca']);

    usInput.checked = false;
    usInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(field.getValue()).toEqual(['ca']);
  });

  it('supports searchable multi-select filtering via type-ahead input', () => {
    const field = createDetailField({
      label: 'Markets',
      editable: true,
      type: 'select',
      multiple: true,
      searchable: true,
      searchPlaceholder: 'Search markets...',
      options: [
        { value: 'us', text: 'United States' },
        { value: 'ca', text: 'Canada' },
        { value: 'mx', text: 'Mexico' },
      ],
    });

    const searchInput = field.root.querySelector('.detail-field-multi-select-search-input');
    expect(searchInput).toBeTruthy();
    expect(searchInput.placeholder).toBe('Search markets...');

    const initialValues = Array.from(
      field.root.querySelectorAll('input[type="checkbox"]'),
    ).map((input) => input.value);
    expect(initialValues).toEqual(['us', 'ca', 'mx']);

    searchInput.value = 'can';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    const filteredValues = Array.from(
      field.root.querySelectorAll('input[type="checkbox"]'),
    ).map((input) => input.value);
    expect(filteredValues).toEqual(['ca']);
  });

  it('keeps selected labels when a selected option is filtered out', () => {
    const field = createDetailField({
      label: 'Markets',
      editable: true,
      type: 'select',
      multiple: true,
      searchable: true,
      value: ['us'],
      options: [
        { value: 'us', text: 'United States' },
        { value: 'ca', text: 'Canada' },
      ],
    });

    const searchInput = field.root.querySelector('.detail-field-multi-select-search-input');
    searchInput.value = 'can';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(field.getSelectedLabels()).toEqual([{ id: 'us', name: 'United States' }]);
  });

  it('renders grouped checkbox layout for hierarchical multi-select', async () => {
    const fetchFromApi = vi.fn().mockResolvedValue({
      topOptions: [{ value: 'all', text: 'All Markets' }],
      groups: [
        {
          label: 'North America',
          options: [{ value: 'us', text: 'United States' }],
        },
      ],
    });
    const field = createDetailField({
      label: 'Markets',
      editable: true,
      type: 'select',
      multiple: true,
      value: ['us'],
      fetchFromApi,
    });

    await flushPromises();

    const groupLabel = field.root.querySelector('.detail-field-multi-select-group-label');
    expect(groupLabel.textContent).toBe('North America');
    const usInput = field.root.querySelector('input[type="checkbox"][value="us"]');
    expect(usInput.checked).toBe(true);
    expect(field.getSelectedLabels()).toEqual([{ id: 'us', name: 'United States' }]);

    usInput.checked = false;
    usInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(field.getValue()).toEqual([]);
  });

  it('loads asynchronous select options from a function with value/label key mapping', async () => {
    const fetchFromApi = vi.fn().mockResolvedValue([
      { rightId: 101, description: 'Digital' },
      { rightId: 102, description: 'TV' },
    ]);

    const field = createDetailField({
      label: 'Media Rights',
      editable: true,
      type: 'select',
      value: '102',
      fetchFromApi,
      optionValueKey: 'rightId',
      optionLabelKey: 'description',
    });

    const select = field.root.querySelector('select');
    expect(select.disabled).toBe(true);
    expect(select.options[0].textContent).toBe('Loading...');

    await flushPromises();

    expect(select.disabled).toBe(false);
    expect(select.value).toBe('102');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Digital', 'TV']);
  });

  it('loads hierarchical options and preserves current value', async () => {
    const fetchFromApi = vi.fn().mockResolvedValue({
      topOptions: [{ value: 'all', text: 'All Markets' }],
      groups: [
        {
          label: 'North America',
          options: [{ value: 'us', text: 'United States' }],
        },
      ],
    });

    const field = createDetailField({
      label: 'Markets',
      editable: true,
      type: 'select',
      fetchFromApi,
      value: 'us',
    });

    const select = field.root.querySelector('select');
    await flushPromises();

    expect(select.querySelector('optgroup').label).toBe('North America');
    expect(field.getValue()).toBe('us');
    expect(field.getSelectedLabel()).toBe('United States');
  });

  it('shows fallback option when async loading fails', async () => {
    const fetchFromApi = vi.fn().mockRejectedValue(new Error('Network error'));

    const field = createDetailField({
      label: 'Failure Case',
      editable: true,
      type: 'select',
      fetchFromApi,
    });

    const select = field.root.querySelector('select');
    await flushPromises();

    expect(select.disabled).toBe(false);
    expect(select.options).toHaveLength(1);
    expect(select.options[0].textContent).toBe('Failed to load options');
  });

  it('fetches select options when fetchFromApi is a URL string', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ value: 'approved', text: 'Approved' }],
      }),
    });

    const field = createDetailField({
      label: 'Status',
      editable: true,
      type: 'select',
      fetchFromApi: '/api/status-options',
      value: 'approved',
    });

    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/status-options', { credentials: 'include' });
    expect(field.getValue()).toBe('approved');
    expect(field.getSelectedLabel()).toBe('Approved');
  });
});
