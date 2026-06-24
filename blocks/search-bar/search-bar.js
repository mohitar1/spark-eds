import {
  SEARCH_URL_PARAMS,
} from '../../scripts/scripts.js';
import { getAppLabel, localizePath } from '../../scripts/locale-utils.js';
import {
  loadSortPreference,
  SORT_TYPE,
  SORT_DIRECTION,
} from '../search-results/utils/sort-utils.js';

const ASSETS_SEARCH_PATH = '/search';

const SEARCH_TYPES = [
  {
    id: 'assets',
    path: ASSETS_SEARCH_PATH,
    labelKey: 'assets',
    labelDefault: 'Assets',
  },
  {
    id: 'collections',
    path: '/search-collections',
    labelKey: 'collections',
    labelDefault: 'Collections',
  },
];

export default async function decorate(block) {
  const t = await getAppLabel();

  const currentPath = window.location.pathname;
  let selectedType = currentPath.includes('search-collections') ? 'collections' : 'assets';

  const queryInputContainer = document.createElement('div');
  queryInputContainer.className = 'query-input-container';

  const queryInputBar = document.createElement('div');
  queryInputBar.className = 'query-input-bar';

  // Type selector
  const typeSelector = document.createElement('div');
  typeSelector.className = 'type-selector';

  const typeSelectorBtn = document.createElement('button');
  typeSelectorBtn.className = 'type-selector-btn';
  typeSelectorBtn.type = 'button';
  typeSelectorBtn.setAttribute('aria-haspopup', 'listbox');
  typeSelectorBtn.setAttribute('aria-expanded', 'false');

  const typeSelectorLabel = document.createElement('span');
  typeSelectorLabel.className = 'type-selector-label';

  const typeSelectorArrow = document.createElement('span');
  typeSelectorArrow.className = 'type-selector-arrow';

  typeSelectorBtn.append(typeSelectorLabel, typeSelectorArrow);

  const typeSelectorDropdown = document.createElement('ul');
  typeSelectorDropdown.className = 'type-selector-dropdown';
  typeSelectorDropdown.setAttribute('role', 'listbox');
  typeSelectorDropdown.hidden = true;

  const updateSelectedType = (typeId) => {
    selectedType = typeId;
    const found = SEARCH_TYPES.find((type) => type.id === typeId);
    typeSelectorLabel.textContent = t(found.labelKey, found.labelDefault);
    typeSelectorDropdown.querySelectorAll('li').forEach((li) => {
      const isSelected = li.dataset.type === typeId;
      li.setAttribute('aria-selected', String(isSelected));
      li.classList.toggle('active', isSelected);
    });
  };

  SEARCH_TYPES.forEach(({ id, labelKey, labelDefault }) => {
    const li = document.createElement('li');
    li.dataset.type = id;
    li.setAttribute('role', 'option');
    li.textContent = t(labelKey, labelDefault);
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSelectedType(id);
      typeSelectorBtn.setAttribute('aria-expanded', 'false');
      typeSelectorDropdown.hidden = true;
    });
    typeSelectorDropdown.appendChild(li);
  });

  typeSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !typeSelectorDropdown.hidden;
    typeSelectorDropdown.hidden = isOpen;
    typeSelectorBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', () => {
    typeSelectorDropdown.hidden = true;
    typeSelectorBtn.setAttribute('aria-expanded', 'false');
  });

  updateSelectedType(selectedType);
  typeSelector.append(typeSelectorBtn, typeSelectorDropdown);

  // Input
  const queryInputWrapper = document.createElement('div');
  queryInputWrapper.className = 'query-input-wrapper';

  const querySearchIcon = document.createElement('span');
  querySearchIcon.className = 'query-search-icon';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'query-input';
  input.placeholder = t('searchPlaceholder', 'What are you looking for?');
  input.autofocus = true;

  const clearIcon = document.createElement('span');
  clearIcon.className = 'query-clear-icon';
  clearIcon.style.display = 'none';

  queryInputWrapper.append(querySearchIcon, input, clearIcon);

  const urlParams = new URLSearchParams(window.location.search);
  const queryParam = urlParams.get(SEARCH_URL_PARAMS.QUERY)
    || urlParams.get(SEARCH_URL_PARAMS.FULLTEXT);
  if (queryParam) {
    input.value = decodeURIComponent(queryParam) || '';
  }

  const getAssetsSearchPath = () => {
    if (document.querySelector('.search-results')) {
      return window.location.pathname;
    }
    return localizePath(ASSETS_SEARCH_PATH);
  };

  const performSearch = () => {
    const query = input.value;
    const typeConfig = SEARCH_TYPES.find((type) => type.id === selectedType);
    const searchPath = selectedType === 'assets'
      ? getAssetsSearchPath()
      : localizePath(typeConfig.path);
    const newParams = new URLSearchParams();
    newParams.set(SEARCH_URL_PARAMS.QUERY, query);

    if (selectedType === 'assets') {
      const storedSort = loadSortPreference(searchPath);
      if (storedSort) {
        newParams.set('sortType', storedSort.sortType);
        newParams.set('sortDirection', storedSort.sortDirection);
      } else {
        newParams.set('sortType', SORT_TYPE.TOP_RESULTS);
        newParams.set('sortDirection', SORT_DIRECTION.DESCENDING);
      }
    }

    window.location.href = `${searchPath}?${newParams.toString()}`;
  };

  const searchBtn = document.createElement('button');
  searchBtn.className = 'query-search-btn';
  searchBtn.setAttribute('aria-label', t('search', 'Search'));
  searchBtn.textContent = t('search', 'Search');
  searchBtn.addEventListener('click', performSearch);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  const toggleClearIcon = () => {
    clearIcon.style.display = input.value ? 'block' : 'none';
  };

  clearIcon.addEventListener('click', () => {
    input.value = '';
    toggleClearIcon();
    input.focus();
    performSearch();
  });

  input.addEventListener('input', toggleClearIcon);
  toggleClearIcon();

  queryInputBar.append(typeSelector, queryInputWrapper, searchBtn);
  queryInputContainer.append(queryInputBar);

  block.textContent = '';
  block.append(queryInputContainer);
}
