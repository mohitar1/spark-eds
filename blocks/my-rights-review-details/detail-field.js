/**
 * Configurable detail-field: label + value (read-only) or label + control (edit).
 * Supports propertyKey for save payload mapping, fetchFromApi for dropdown options,
 * datePickerFactory for date fields, and hierarchical (optgroup) select options.
 *
 * @example
 * // Read-only
 * const el = createDetailField({ label: 'Name', value: 'John' });
 *
 * @example
 * // Editable with property key (for save payload)
 * const field = createDetailField({
 *   label: 'Name', value: 'John', editable: true, propertyKey: 'associateAgency.name',
 * });
 * payload[field.propertyKey] = field.getValue();
 *
 * @example
 * // Select with options from API (flat or hierarchical { topOptions, groups })
 * const field = await createDetailField({
 *   label: 'Type', value: 'Agency', editable: true, type: 'select',
 *   fetchFromApi: '/api/request-types',  // or async () => [{ value, text }]
 * });
 */

/**
 * Resolve select options from fetchFromApi (URL or async function).
 * @param {string|function} fetchFromApi - URL to GET or () => Promise<Array|Object>
 * @returns {Promise<Array|{ topOptions: Array, groups: Array }>}
 */
async function resolveOptions(fetchFromApi) {
  if (typeof fetchFromApi === 'function') {
    const result = await fetchFromApi();
    return result;
  }
  if (typeof fetchFromApi === 'string') {
    const res = await fetch(fetchFromApi, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data?.data && Array.isArray(data.data)) return data.data;
    if (data?.options && Array.isArray(data.options)) return data.options;
    return [];
  }
  return [];
}

function parseValueToDate(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return val;
  if (typeof val === 'object' && val.year != null && val.month != null && val.day != null) {
    return new Date(val.year, val.month - 1, val.day);
  }
  if (typeof val === 'string') {
    // YYYY-MM-DD strings are parsed as UTC by Date constructor, which shifts
    // the day in timezones behind UTC. Parse them as local midnight instead.
    const ymd = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const d = ymd
      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
      : new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function dateToIsoString(date) {
  if (!date || !(date instanceof Date)) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Create a detail field (label + value or label + input/select/textarea/date picker).
 * When type is 'select' and fetchFromApi is set, returns synchronously with
 * a loading state; options load in the background.
 *
 * @param {Object} options
 * @param {string} options.label - Field label text
 * @param {string} [options.value] - Initial value (display or input value)
 * @param {boolean} [options.editable=false] - If true, render an input instead of static value
 * @param {string} [options.propertyKey] - Key for save payload (e.g. 'associateAgency.name')
 * @param {'text'|'email'|'tel'|'select'|'date'|'textarea'}
 * [options.type='text'] - Input type when editable
 * @param {string} [options.name] - Input name attribute when editable
 * @param {string} [options.id] - Input id when editable (optional)
 * @param {string} [options.placeholder] - Placeholder when editable
 * @param {boolean} [options.required] - Required attribute when editable
 * @param {Date|string|Object|null} [options.minValue] - Minimum selectable date value
 * @param {Date|string|Object|null} [options.maxValue] - Maximum selectable date value
 * @param {Array<{ value: string, text: string }>} [options.options]
 * - Static options for type 'select'
 * @param {string|function} [options.fetchFromApi]
 * - URL or async () => options for type 'select'
 * @param {string} [options.optionValueKey]
 * - When fetchFromApi returns objects, key for option value
 * @param {string} [options.optionLabelKey]
 * - When fetchFromApi returns objects, key for option label
 * @param {boolean} [options.searchable]
 * - When true for multi-select fields, render a type-ahead filter input
 * @param {string} [options.searchPlaceholder]
 * - Placeholder text for the multi-select type-ahead input
 * @param {function} [options.datePickerFactory]
 * - When type is 'date', async (value, opts) => Promise<HTMLElement>
 * @returns {HTMLElement|{ root: HTMLElement, getValue: function,
 * setValue: function, propertyKey?: string }|Promise<...>}
 */
export function createDetailField(options) {
  const {
    label,
    value = '',
    editable = false,
    propertyKey = '',
    type = 'text',
    name = '',
    id = '',
    placeholder = '',
    required = false,
    minValue = null,
    maxValue = null,
    options: selectOptions = [],
    fetchFromApi,
    optionValueKey = '',
    optionLabelKey = '',
    multiple = false,
    searchable = false,
    searchPlaceholder = '',
    datePickerFactory = null,
  } = options;

  const root = document.createElement('div');
  root.className = 'detail-field';

  const labelEl = document.createElement('div');
  labelEl.className = 'detail-label';
  labelEl.textContent = label;
  root.appendChild(labelEl);

  const valueEl = document.createElement('div');
  valueEl.className = 'detail-value';

  if (!editable) {
    valueEl.textContent = value || 'N/A';
    root.appendChild(valueEl);
    return root;
  }

  let valueArr = [];
  if (Array.isArray(value)) {
    valueArr = value;
  } else if (value) {
    valueArr = [value];
  }
  valueArr = valueArr.map((v) => String(v));
  const [firstValue = ''] = valueArr;
  const result = (
    fieldRoot,
    getValue,
    setValue,
    getSelectedLabel = null,
    getSelectedLabels = null,
  ) => ({
    root: fieldRoot,
    getValue,
    setValue,
    ...(propertyKey ? { propertyKey } : {}),
    ...(getSelectedLabel ? { getSelectedLabel } : {}),
    ...(getSelectedLabels ? { getSelectedLabels } : {}),
  });

  // Editable select: single-select uses native select, multi-select uses checkbox list UI.
  if (type === 'select') {
    const toOptionItem = (opt) => ({
      value: String(opt?.value ?? opt?.text ?? ''),
      text: String(opt?.text ?? opt?.value ?? ''),
    });
    const mapFlatOptions = (raw) => {
      if (
        optionValueKey
        && optionLabelKey
        && raw?.length
        && typeof raw[0] === 'object'
      ) {
        return raw.map((o) => ({
          value: String(o[optionValueKey] ?? ''),
          text: String(o[optionLabelKey] ?? o[optionValueKey] ?? ''),
        }));
      }
      return (raw || []).map((opt) => toOptionItem(opt));
    };
    const normalizeHierarchicalOptions = (raw) => ({
      topOptions: (raw?.topOptions || []).map((opt) => toOptionItem(opt)),
      groups: (raw?.groups || []).map((grp) => ({
        label: grp?.label || '',
        options: (grp?.options || []).map((opt) => toOptionItem(opt)),
      })),
    });

    if (multiple) {
      const selectedSet = new Set(valueArr);
      const optionTextByValue = new Map();
      let flatOptions = [];
      let hierarchicalOptions = { topOptions: [], groups: [] };
      let hasHierarchicalOptions = false;
      let activeQuery = '';

      const normalizeQuery = (query) => String(query || '').trim().toLowerCase();
      const isOptionMatch = (opt, normalizedQuery) => {
        if (!normalizedQuery) return true;
        const optionText = String(opt?.text || '').toLowerCase();
        const optionValue = String(opt?.value || '').toLowerCase();
        return optionText.includes(normalizedQuery) || optionValue.includes(normalizedQuery);
      };
      const getEmptyMessage = () => (
        activeQuery ? 'No matching options' : 'No options available'
      );
      const addOptionTextLookup = (opts) => {
        (opts || []).forEach((opt) => {
          const optionValue = String(opt?.value || '');
          if (!optionValue || optionTextByValue.has(optionValue)) return;
          optionTextByValue.set(optionValue, String(opt?.text || optionValue));
        });
      };
      const addHierarchicalTextLookup = (topOptions, groups) => {
        addOptionTextLookup(topOptions);
        (groups || []).forEach((grp) => addOptionTextLookup(grp.options || []));
      };
      const filterFlatOptions = (opts) => {
        const normalizedQuery = normalizeQuery(activeQuery);
        if (!normalizedQuery) return opts;
        return (opts || []).filter((opt) => isOptionMatch(opt, normalizedQuery));
      };
      const filterHierarchicalOptions = (topOptions, groups) => {
        const normalizedQuery = normalizeQuery(activeQuery);
        if (!normalizedQuery) {
          return { topOptions, groups };
        }

        const filteredTopOptions = (topOptions || []).filter((opt) => (
          isOptionMatch(opt, normalizedQuery)
        ));
        const filteredGroups = (groups || [])
          .map((grp) => {
            const groupLabel = String(grp?.label || '');
            const groupMatch = groupLabel.toLowerCase().includes(normalizedQuery);
            const groupOptions = groupMatch
              ? (grp.options || [])
              : (grp.options || []).filter((opt) => isOptionMatch(opt, normalizedQuery));
            return {
              label: groupLabel,
              options: groupOptions,
            };
          })
          .filter((grp) => grp.options.length > 0);

        return {
          topOptions: filteredTopOptions,
          groups: filteredGroups,
        };
      };

      const searchWrap = document.createElement('div');
      searchWrap.className = 'detail-field-multi-select-search';
      const searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'detail-field-input detail-field-multi-select-search-input';
      searchInput.placeholder = searchPlaceholder || 'Search options...';
      searchInput.setAttribute('aria-label', `${label} search`);
      searchWrap.appendChild(searchInput);

      const list = document.createElement('div');
      list.className = 'detail-field-multi-select detail-field-multi-select-list';
      if (searchable) valueEl.appendChild(searchWrap);
      valueEl.appendChild(list);
      root.appendChild(valueEl);

      const renderMessage = (text, extraClass = '') => {
        list.textContent = '';
        const message = document.createElement('div');
        message.className = `detail-field-multi-select-message ${extraClass}`.trim();
        message.textContent = text;
        list.appendChild(message);
      };

      const getCheckboxes = () => Array.from(
        list.querySelectorAll('input[type="checkbox"]'),
      );
      const syncCheckboxStates = () => {
        getCheckboxes().forEach((input) => {
          input.checked = selectedSet.has(String(input.value));
        });
      };
      const bindCheckbox = (input) => {
        input.addEventListener('change', () => {
          const valueStr = String(input.value);
          if (input.checked) {
            selectedSet.add(valueStr);
          } else {
            selectedSet.delete(valueStr);
          }
        });
      };
      const appendOptionItem = (container, opt) => {
        const wrap = document.createElement('label');
        wrap.className = 'detail-field-multi-select-item';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'detail-field-multi-select-checkbox';
        input.value = opt.value;
        input.dataset.label = opt.text;
        if (name) input.name = name;
        if (selectedSet.has(opt.value)) input.checked = true;
        bindCheckbox(input);
        const text = document.createElement('span');
        text.className = 'detail-field-multi-select-text';
        text.textContent = opt.text;
        wrap.appendChild(input);
        wrap.appendChild(text);
        container.appendChild(wrap);
      };
      const renderFlatOptions = (opts) => {
        list.textContent = '';
        (opts || []).forEach((opt) => appendOptionItem(list, opt));
        if (!list.children.length) renderMessage(getEmptyMessage());
      };
      const renderHierarchicalOptions = (topOptions, groups) => {
        list.textContent = '';
        (topOptions || []).forEach((opt) => appendOptionItem(list, opt));
        (groups || []).forEach((grp) => {
          const group = document.createElement('div');
          group.className = 'detail-field-multi-select-group';
          if (grp.label) {
            const groupLabelEl = document.createElement('div');
            groupLabelEl.className = 'detail-field-multi-select-group-label';
            groupLabelEl.textContent = grp.label;
            group.appendChild(groupLabelEl);
          }
          (grp.options || []).forEach((opt) => appendOptionItem(group, opt));
          list.appendChild(group);
        });
        if (!list.children.length) renderMessage(getEmptyMessage());
      };
      const renderCurrentOptions = () => {
        if (hasHierarchicalOptions) {
          const filtered = filterHierarchicalOptions(
            hierarchicalOptions.topOptions,
            hierarchicalOptions.groups,
          );
          renderHierarchicalOptions(filtered.topOptions, filtered.groups);
        } else {
          renderFlatOptions(filterFlatOptions(flatOptions));
        }
      };

      const getVal = () => Array.from(selectedSet);
      const setVal = (v) => {
        selectedSet.clear();
        if (Array.isArray(v)) {
          v.forEach((item) => {
            const valueStr = String(item ?? '').trim();
            if (valueStr) selectedSet.add(valueStr);
          });
        } else if (v != null && v !== '') {
          selectedSet.add(String(v));
        }
        syncCheckboxStates();
      };
      const getSelectedLabels = () => Array.from(selectedSet)
        .map((valueId) => ({
          id: String(valueId),
          name: String(optionTextByValue.get(String(valueId)) || valueId),
        }))
        .filter((item) => item.id);

      if (searchable) {
        searchInput.addEventListener('input', () => {
          activeQuery = searchInput.value || '';
          renderCurrentOptions();
          syncCheckboxStates();
        });
      }

      if (fetchFromApi) {
        list.setAttribute('aria-busy', 'true');
        list.classList.add('detail-field-select-loading');
        renderMessage('Loading...', 'detail-field-multi-select-loading');

        resolveOptions(fetchFromApi).then((rawOpts) => {
          list.removeAttribute('aria-busy');
          list.classList.remove('detail-field-select-loading');
          if (rawOpts && Array.isArray(rawOpts.groups)) {
            hasHierarchicalOptions = true;
            hierarchicalOptions = normalizeHierarchicalOptions(rawOpts);
            addHierarchicalTextLookup(
              hierarchicalOptions.topOptions,
              hierarchicalOptions.groups,
            );
            renderCurrentOptions();
          } else {
            hasHierarchicalOptions = false;
            flatOptions = mapFlatOptions(rawOpts);
            addOptionTextLookup(flatOptions);
            renderCurrentOptions();
          }
          syncCheckboxStates();
        }).catch(() => {
          list.removeAttribute('aria-busy');
          list.classList.remove('detail-field-select-loading');
          renderMessage('Failed to load options', 'detail-field-multi-select-error');
        });
      } else {
        hasHierarchicalOptions = false;
        flatOptions = (selectOptions || []).map((opt) => toOptionItem(opt));
        addOptionTextLookup(flatOptions);
        renderCurrentOptions();
        syncCheckboxStates();
      }

      return result(root, getVal, setVal, null, getSelectedLabels);
    }

    const select = document.createElement('select');
    if (id) select.id = id;
    if (name) select.name = name;
    select.className = 'detail-field-input detail-field-select';

    const populateSelect = (opts) => {
      select.textContent = '';
      (opts || []).forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        option.selected = option.value === firstValue;
        select.appendChild(option);
      });
    };
    const populateSelectHierarchical = (topOptions, groups) => {
      select.textContent = '';
      (topOptions || []).forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        option.selected = option.value === firstValue;
        select.appendChild(option);
      });
      (groups || []).forEach((grp) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = grp.label || '';
        (grp.options || []).forEach((opt) => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.text;
          option.selected = option.value === firstValue;
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });
      if (firstValue && !select.value) select.value = firstValue;
    };

    const getVal = () => select.value;
    const setVal = (v) => {
      select.value = v ?? '';
    };
    const getSelectedLabel = () => {
      const option = select.options[select.selectedIndex];
      return option ? option.textContent.trim() : '';
    };

    if (fetchFromApi) {
      select.disabled = true;
      select.setAttribute('aria-busy', 'true');
      select.classList.add('detail-field-select-loading');
      const loadingOption = document.createElement('option');
      loadingOption.value = '';
      loadingOption.textContent = 'Loading...';
      select.appendChild(loadingOption);
      valueEl.appendChild(select);
      root.appendChild(valueEl);

      const out = result(root, getVal, setVal, getSelectedLabel);

      resolveOptions(fetchFromApi).then((rawOpts) => {
        select.textContent = '';
        select.disabled = false;
        select.removeAttribute('aria-busy');
        select.classList.remove('detail-field-select-loading');
        if (rawOpts && Array.isArray(rawOpts.groups)) {
          const normalized = normalizeHierarchicalOptions(rawOpts);
          populateSelectHierarchical(normalized.topOptions, normalized.groups);
        } else {
          populateSelect(mapFlatOptions(rawOpts));
        }
        if (firstValue && !select.value) select.value = firstValue;
      }).catch(() => {
        select.textContent = '';
        const errOpt = document.createElement('option');
        errOpt.value = '';
        errOpt.textContent = 'Failed to load options';
        select.appendChild(errOpt);
        select.disabled = false;
        select.removeAttribute('aria-busy');
        select.classList.remove('detail-field-select-loading');
      });

      return out;
    }

    populateSelect((selectOptions || []).map((opt) => toOptionItem(opt)));
    valueEl.appendChild(select);
    root.appendChild(valueEl);
    return result(root, getVal, setVal, getSelectedLabel);
  }

  if (type === 'checkboxes') {
    const selectedSet = new Set(valueArr.map((v) => String(v)));
    const wrap = document.createElement('div');
    wrap.className = 'detail-field-checkboxes';
    (selectOptions || []).forEach((opt) => {
      const box = document.createElement('label');
      box.className = 'detail-field-checkbox-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name || propertyKey;
      input.value = opt.value ?? opt.text ?? '';
      input.checked = selectedSet.has(input.value);
      const span = document.createElement('span');
      span.textContent = opt.text ?? opt.value ?? '';
      box.appendChild(input);
      box.appendChild(span);
      wrap.appendChild(box);
    });
    valueEl.appendChild(wrap);
    root.appendChild(valueEl);
    const getVal = () => {
      const selected = Array.from(wrap.querySelectorAll('input:checked')).map((i) => String(i.value));
      return Array.from(new Set(selected));
    };
    const setVal = (v) => {
      let arr = [];
      if (Array.isArray(v)) {
        arr = v;
      } else if (v) {
        arr = [v];
      }
      const selected = new Set(arr.map((item) => String(item)));
      wrap.querySelectorAll('input').forEach((i) => {
        i.checked = selected.has(String(i.value));
      });
    };
    return result(root, getVal, setVal);
  }

  if (type === 'textarea') {
    const textarea = document.createElement('textarea');
    if (id) textarea.id = id;
    if (name) textarea.name = name;
    textarea.className = 'detail-field-input detail-field-textarea';
    textarea.value = value ?? '';
    textarea.placeholder = placeholder;
    textarea.required = required;
    valueEl.appendChild(textarea);
    root.appendChild(valueEl);
    return result(root, () => textarea.value, (v) => { textarea.value = v ?? ''; });
  }

  // Editable date: use injected date picker when available; otherwise native input.
  if (type === 'date') {
    let currentDate = parseValueToDate(value);
    const minDate = parseValueToDate(minValue);
    const maxDate = parseValueToDate(maxValue);
    if (typeof datePickerFactory === 'function') {
      const pickerHost = document.createElement('div');
      pickerHost.className = 'detail-field-date-picker';
      valueEl.appendChild(pickerHost);
      root.appendChild(valueEl);

      let picker = null;
      const syncPickerValue = () => {
        if (picker && typeof picker.setValue === 'function') {
          picker.setValue(currentDate);
        }
      };

      const pickerOptions = {
        onChange: (nextDate) => {
          currentDate = parseValueToDate(nextDate);
        },
        onClear: () => {
          currentDate = null;
        },
        showClearButton: true,
      };
      if (minDate) pickerOptions.minValue = minDate;
      if (maxDate) pickerOptions.maxValue = maxDate;

      Promise.resolve(datePickerFactory(currentDate, pickerOptions))
        .then((pickerEl) => {
          if (!pickerEl) return;
          picker = pickerEl;
          pickerHost.textContent = '';
          pickerHost.appendChild(pickerEl);
          syncPickerValue();
        })
        .catch(() => {
          const fallbackInput = document.createElement('input');
          fallbackInput.type = 'date';
          fallbackInput.className = 'detail-field-input';
          fallbackInput.value = currentDate ? dateToIsoString(currentDate) : '';
          fallbackInput.min = minDate ? dateToIsoString(minDate) : '';
          fallbackInput.max = maxDate ? dateToIsoString(maxDate) : '';
          fallbackInput.addEventListener('input', () => {
            currentDate = parseValueToDate(fallbackInput.value);
          });
          picker = {
            setValue: (nextValue) => {
              const date = parseValueToDate(nextValue);
              fallbackInput.value = date ? dateToIsoString(date) : '';
            },
          };
          pickerHost.textContent = '';
          pickerHost.appendChild(fallbackInput);
        });

      return result(root, () => {
        if (!currentDate) return '';
        return dateToIsoString(currentDate);
      }, (v) => {
        currentDate = parseValueToDate(v);
        syncPickerValue();
      });
    }

    const valueAsDate = currentDate;
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'detail-field-input';
    if (id) input.id = id;
    if (name) input.name = name;
    input.value = valueAsDate ? dateToIsoString(valueAsDate) : '';
    input.min = minDate ? dateToIsoString(minDate) : '';
    input.max = maxDate ? dateToIsoString(maxDate) : '';
    input.placeholder = placeholder;
    input.required = required;
    valueEl.appendChild(input);
    root.appendChild(valueEl);
    return result(root, () => input.value || '', (v) => {
      const d = parseValueToDate(v);
      input.value = d ? dateToIsoString(d) : '';
    });
  }

  const input = document.createElement('input');
  input.type = type;
  if (id) input.id = id;
  if (name) input.name = name;
  input.className = 'detail-field-input';
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.required = required;
  valueEl.appendChild(input);
  root.appendChild(valueEl);

  return result(root, () => input.value, (v) => { input.value = v ?? ''; });
}

export default createDetailField;
