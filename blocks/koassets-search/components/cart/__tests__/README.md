# Cart Component Tests

This directory contains unit tests for the cart components.

## Test Files

### `save-intended-use.test.js`

Comprehensive test suite for the "Save Intended Use" functionality that allows users to save, load, and delete form data to/from localStorage.

#### Test Coverage

**1. `getSavedIntendedUses()`**
- Returns empty array when localStorage is empty
- Parses and returns saved data from localStorage
- Handles JSON parsing errors gracefully
- Supports multiple saved intended uses

**2. `saveIntendedUse(name, data)`**
- Saves new intended use to localStorage
- Appends to existing saved intended uses
- Handles empty sets for markets and channels
- Generates unique IDs for each saved use
- Returns false on localStorage errors
- Converts Sets to Arrays for storage

**3. `deleteIntendedUse(id)`**
- Deletes intended use by ID
- Handles deleting the only item
- No-op when deleting non-existent ID
- Returns false on localStorage errors

**4. `loadIntendedUse(id)`**
- Loads intended use and updates form state
- Returns null when not found
- Handles empty localStorage
- Handles null/undefined markets and channels
- Returns null on errors

**5. `resetRequestDownloadFormState()`**
- Resets form state to initial values

**6. Integration Tests**
- Complete workflow: save → load → delete
- Verifies end-to-end functionality

**7. Edge Cases**
- Very long campaign names (1000+ characters)
- Special characters in names (`<>&"'{}[]`)
- Large number of saved uses (100+)
- Undefined data fields
- localStorage quota exceeded

#### Test Statistics

- **Total Test Suites:** 8 (including integration and edge cases)
- **Total Test Cases:** 34
- **Mock Dependencies:** localStorage, console.error, console.log

#### Running Tests

To run only the Save Intended Use tests:

```bash
npm test -- save-intended-use.test.js
```

To run all cart component tests:

```bash
npm test -- blocks/koassets-search/components/cart/__tests__
```

To run all tests with watch mode:

```bash
npm run test:watch
```

#### Test Dependencies

- **Test Framework:** Vitest
- **Mocked APIs:**
  - `localStorage` (getItem, setItem, removeItem, clear)
  - `console.error`
  - `console.log`
  - `Date.now()` (for ID generation tests)

#### Notes

- All tests use proper cleanup with `beforeEach` and `afterEach` hooks
- localStorage is fully mocked to avoid side effects
- Console methods are mocked to prevent test output pollution
- Tests follow the Arrange-Act-Assert pattern
- Each test is isolated and independent
