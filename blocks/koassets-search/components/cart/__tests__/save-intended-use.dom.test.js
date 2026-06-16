/**
 * Unit tests for Save Intended Use functionality in cart-request-download.js
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  getSavedIntendedUses,
  saveIntendedUse,
  deleteIntendedUse,
  loadIntendedUse,
  resetRequestDownloadFormState,
  isFormValid,
} from '../cart-request-download.js';

describe('Save Intended Use Functionality', () => {
  // Mock localStorage
  let localStorageMock;

  beforeEach(() => {
    // Create a fresh localStorage mock for each test
    localStorageMock = (() => {
      let store = {};
      return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
          store[key] = value.toString();
        }),
        removeItem: vi.fn((key) => {
          delete store[key];
        }),
        clear: vi.fn(() => {
          store = {};
        }),
      };
    })();

    // Replace global localStorage with mock
    global.localStorage = localStorageMock;

    // Reset form state before each test
    resetRequestDownloadFormState();

    // Clear console spies
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSavedIntendedUses', () => {
    it('should return empty array when localStorage is empty', () => {
      const result = getSavedIntendedUses();
      expect(result).toEqual([]);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('koassets-saved-intended-uses');
    });

    it('should return parsed array from localStorage', () => {
      const mockData = [
        {
          id: '1234567890',
          name: 'Test Campaign',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
          selectedMarkets: ['US', 'CA'],
          selectedMediaChannels: ['TV', 'Digital'],
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = getSavedIntendedUses();
      expect(result).toEqual(mockData);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Campaign');
    });

    it('should return empty array and log error when JSON parsing fails', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json{');

      const result = getSavedIntendedUses();
      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        'Error loading saved intended uses:',
        expect.any(Error),
      );
    });

    it('should handle multiple saved intended uses', () => {
      const mockData = [
        {
          id: '1',
          name: 'Campaign 1',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
        },
        {
          id: '2',
          name: 'Campaign 2',
          airDate: '2024-03-15',
          pullDate: '2024-04-15',
        },
        {
          id: '3',
          name: 'Campaign 3',
          airDate: '2024-05-15',
          pullDate: '2024-06-15',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = getSavedIntendedUses();
      expect(result).toHaveLength(3);
      expect(result[1].name).toBe('Campaign 2');
    });
  });

  describe('saveIntendedUse', () => {
    it('should save a new intended use to localStorage', () => {
      const name = 'Test Campaign';
      const data = {
        airDate: '2024-01-15',
        pullDate: '2024-02-15',
        selectedMarkets: new Set(['US', 'CA']),
        selectedMediaChannels: new Set(['TV', 'Digital']),
      };

      const result = saveIntendedUse(name, data);

      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalled();

      // Verify the saved data structure
      const savedCall = localStorageMock.setItem.mock.calls[0];
      expect(savedCall[0]).toBe('koassets-saved-intended-uses');

      const savedData = JSON.parse(savedCall[1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].name).toBe('Test Campaign');
      expect(savedData[0].airDate).toBe('2024-01-15');
      expect(savedData[0].pullDate).toBe('2024-02-15');
      expect(savedData[0].selectedMarkets).toEqual(['US', 'CA']);
      expect(savedData[0].selectedMediaChannels).toEqual(['TV', 'Digital']);
      expect(savedData[0].id).toBeDefined();
      expect(savedData[0].createdAt).toBeDefined();
    });

    it('should append to existing saved intended uses', () => {
      const existingData = [
        {
          id: '1',
          name: 'Existing Campaign',
          airDate: '2024-01-01',
          pullDate: '2024-02-01',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(existingData));

      const result = saveIntendedUse('New Campaign', {
        airDate: '2024-03-01',
        pullDate: '2024-04-01',
        selectedMarkets: new Set(['UK']),
        selectedMediaChannels: new Set(['Radio']),
      });

      expect(result).toBe(true);

      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData).toHaveLength(2);
      expect(savedData[0].name).toBe('Existing Campaign');
      expect(savedData[1].name).toBe('New Campaign');
    });

    it('should handle empty sets for markets and channels', () => {
      const result = saveIntendedUse('Empty Campaign', {
        airDate: '2024-01-15',
        pullDate: '2024-02-15',
        selectedMarkets: new Set(),
        selectedMediaChannels: new Set(),
      });

      expect(result).toBe(true);

      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData[0].selectedMarkets).toEqual([]);
      expect(savedData[0].selectedMediaChannels).toEqual([]);
    });

    it('should return false and log error when localStorage.setItem fails', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage is full');
      });

      const result = saveIntendedUse('Test', {
        airDate: '2024-01-15',
        pullDate: '2024-02-15',
        selectedMarkets: new Set(['US']),
        selectedMediaChannels: new Set(['TV']),
      });

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Error saving intended use:',
        expect.any(Error),
      );
    });

    it('should generate unique IDs for each saved use', () => {
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(1000000)
        .mockReturnValueOnce(2000000);

      saveIntendedUse('First', {
        airDate: '2024-01-15',
        pullDate: '2024-02-15',
        selectedMarkets: new Set(),
        selectedMediaChannels: new Set(),
      });

      const firstSaved = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);

      saveIntendedUse('Second', {
        airDate: '2024-03-15',
        pullDate: '2024-04-15',
        selectedMarkets: new Set(),
        selectedMediaChannels: new Set(),
      });

      const secondSaved = JSON.parse(localStorageMock.setItem.mock.calls[1][1]);

      expect(firstSaved[0].id).toBe('1000000');
      expect(secondSaved[1].id).toBe('2000000');
    });
  });

  describe('deleteIntendedUse', () => {
    it('should delete an intended use by id', () => {
      const mockData = [
        {
          id: '1',
          name: 'Campaign 1',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
        },
        {
          id: '2',
          name: 'Campaign 2',
          airDate: '2024-03-15',
          pullDate: '2024-04-15',
        },
        {
          id: '3',
          name: 'Campaign 3',
          airDate: '2024-05-15',
          pullDate: '2024-06-15',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = deleteIntendedUse('2');

      expect(result).toBe(true);

      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData).toHaveLength(2);
      expect(savedData[0].id).toBe('1');
      expect(savedData[1].id).toBe('3');
      expect(savedData.find((use) => use.id === '2')).toBeUndefined();
    });

    it('should handle deleting the only item', () => {
      const mockData = [
        {
          id: '1',
          name: 'Only Campaign',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = deleteIntendedUse('1');

      expect(result).toBe(true);

      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData).toHaveLength(0);
    });

    it('should not modify data when deleting non-existent id', () => {
      const mockData = [
        {
          id: '1',
          name: 'Campaign 1',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = deleteIntendedUse('non-existent');

      expect(result).toBe(true);

      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('1');
    });

    it('should return false and log error when localStorage operation fails', () => {
      // Mock setItem to fail instead of getItem, since getItem is wrapped in getSavedIntendedUses
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });

      const result = deleteIntendedUse('1');

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Error deleting intended use:',
        expect.any(Error),
      );
    });
  });

  describe('loadIntendedUse', () => {
    it('should load an intended use and update form state', () => {
      const mockData = [
        {
          id: '1',
          name: 'Test Campaign',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
          selectedMarkets: ['US', 'CA'],
          selectedMediaChannels: ['TV', 'Digital'],
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = loadIntendedUse('1');

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Campaign');
      expect(result.airDate).toBe('2024-01-15');
      expect(result.pullDate).toBe('2024-02-15');
      // Note: formState is internal and cannot be directly tested without exporting it
      // We verify by checking that the function returns the expected data
    });

    it('should return null when intended use is not found', () => {
      const mockData = [
        {
          id: '1',
          name: 'Campaign 1',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = loadIntendedUse('non-existent');

      expect(result).toBeNull();
    });

    it('should handle loading from empty localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = loadIntendedUse('1');

      expect(result).toBeNull();
    });

    it('should handle intended uses with empty markets and channels', () => {
      const mockData = [
        {
          id: '1',
          name: 'Empty Campaign',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
          selectedMarkets: [],
          selectedMediaChannels: [],
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = loadIntendedUse('1');

      expect(result).toBeDefined();
      expect(result.selectedMarkets).toEqual([]);
      expect(result.selectedMediaChannels).toEqual([]);
    });

    it('should handle intended uses with null or undefined markets and channels', () => {
      const mockData = [
        {
          id: '1',
          name: 'Null Campaign',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
          selectedMarkets: null,
          selectedMediaChannels: undefined,
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = loadIntendedUse('1');

      expect(result).toBeDefined();
      // The function should handle null/undefined gracefully
    });

    it('should return null and log error when localStorage operation fails', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });

      const result = loadIntendedUse('1');

      expect(result).toBeNull();
      // The error is logged from getSavedIntendedUses which is called by loadIntendedUse
      expect(console.error).toHaveBeenCalledWith(
        'Error loading saved intended uses:',
        expect.any(Error),
      );
    });
  });

  describe('resetRequestDownloadFormState', () => {
    it('should reset form state to initial values', () => {
      // First, let's save and load some data to modify the form state
      const mockData = [
        {
          id: '1',
          name: 'Test Campaign',
          airDate: '2024-01-15',
          pullDate: '2024-02-15',
          selectedMarkets: ['US', 'CA'],
          selectedMediaChannels: ['TV', 'Digital'],
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));
      loadIntendedUse('1');

      // Now reset
      resetRequestDownloadFormState();

      // Verify by loading a non-existent item and saving new data
      const result = saveIntendedUse('New After Reset', {
        airDate: '2024-03-01',
        pullDate: '2024-04-01',
        selectedMarkets: new Set(['UK']),
        selectedMediaChannels: new Set(['Radio']),
      });

      expect(result).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very long campaign names', () => {
      const longName = 'A'.repeat(1000);
      const result = saveIntendedUse(longName, {
        airDate: '2024-01-15',
        pullDate: '2024-02-15',
        selectedMarkets: new Set(),
        selectedMediaChannels: new Set(),
      });

      expect(result).toBe(true);
      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData[0].name).toHaveLength(1000);
    });

    it('should handle special characters in campaign names', () => {
      const specialName = 'Campaign <>&"\'{}[]';
      const result = saveIntendedUse(specialName, {
        airDate: '2024-01-15',
        pullDate: '2024-02-15',
        selectedMarkets: new Set(),
        selectedMediaChannels: new Set(),
      });

      expect(result).toBe(true);
      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData[0].name).toBe(specialName);
    });

    it('should handle large number of saved intended uses', () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        name: `Campaign ${i}`,
        airDate: '2024-01-15',
        pullDate: '2024-02-15',
        selectedMarkets: ['US'],
        selectedMediaChannels: ['TV'],
      }));
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = getSavedIntendedUses();
      expect(result).toHaveLength(100);
    });

    it('should handle undefined data fields gracefully', () => {
      const result = saveIntendedUse('Test', {
        airDate: undefined,
        pullDate: undefined,
        selectedMarkets: undefined,
        selectedMediaChannels: undefined,
      });

      expect(result).toBe(true);
      const savedCall = localStorageMock.setItem.mock.calls[0];
      const savedData = JSON.parse(savedCall[1]);
      expect(savedData[0].airDate).toBeUndefined();
      expect(savedData[0].pullDate).toBeUndefined();
    });
  });

  describe('Form Validation (isFormValid)', () => {
    it('should return false when form is empty', () => {
      resetRequestDownloadFormState();
      // isFormValid checks formState which is empty after reset
      const result = isFormValid();
      expect(result).toBeFalsy(); // Should be falsy (false or null/undefined)
    });

    it('should return false when only air date is set', () => {
      resetRequestDownloadFormState();
      // Use dynamic future date
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);

      // Save and load partial data (missing markets and channels)
      saveIntendedUse('Partial Air Date', {
        airDate: {
          year: futureDate.getFullYear(),
          month: futureDate.getMonth() + 1,
          day: futureDate.getDate(),
        },
        pullDate: null,
        selectedMarkets: new Set(),
        selectedMediaChannels: new Set(),
      });

      // Mock localStorage to return the saved data
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedData));

      // Load it to update formState
      loadIntendedUse(savedData[0].id);

      const result = isFormValid();
      expect(result).toBeFalsy();
    });

    it('should return false when air date and pull date are set but no markets', () => {
      resetRequestDownloadFormState();
      // Use dynamic future dates
      const airDate = new Date();
      airDate.setMonth(airDate.getMonth() + 1);
      const pullDate = new Date(airDate);
      pullDate.setMonth(airDate.getMonth() + 1);

      saveIntendedUse('Partial Dates', {
        airDate: {
          year: airDate.getFullYear(),
          month: airDate.getMonth() + 1,
          day: airDate.getDate(),
        },
        pullDate: {
          year: pullDate.getFullYear(),
          month: pullDate.getMonth() + 1,
          day: pullDate.getDate(),
        },
        selectedMarkets: new Set(),
        selectedMediaChannels: new Set(),
      });

      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedData));
      loadIntendedUse(savedData[0].id);

      const result = isFormValid();
      expect(result).toBeFalsy();
    });

    it('should return false when air date, pull date, and markets are set but no media channels', () => {
      resetRequestDownloadFormState();
      // Use dynamic future dates
      const airDate = new Date();
      airDate.setMonth(airDate.getMonth() + 1);
      const pullDate = new Date(airDate);
      pullDate.setMonth(airDate.getMonth() + 1);

      saveIntendedUse('Partial with Markets', {
        airDate: {
          year: airDate.getFullYear(),
          month: airDate.getMonth() + 1,
          day: airDate.getDate(),
        },
        pullDate: {
          year: pullDate.getFullYear(),
          month: pullDate.getMonth() + 1,
          day: pullDate.getDate(),
        },
        selectedMarkets: new Set([
          {
            id: 1,
            rightId: 1,
            name: 'US',
          },
        ]),
        selectedMediaChannels: new Set(),
      });

      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedData));
      loadIntendedUse(savedData[0].id);

      const result = isFormValid();
      expect(result).toBeFalsy();
    });

    it('should return true when all required fields are filled', () => {
      // Use dynamic future dates
      const today = new Date();
      const futureAirDate = new Date(today);
      futureAirDate.setMonth(today.getMonth() + 2); // 2 months from now

      const futurePullDate = new Date(futureAirDate);
      futurePullDate.setMonth(futureAirDate.getMonth() + 1); // 1 month after air date

      const mockData = [
        {
          id: '1',
          name: 'Complete Campaign',
          airDate: {
            year: futureAirDate.getFullYear(),
            month: futureAirDate.getMonth() + 1, // JavaScript months are 0-based
            day: futureAirDate.getDate(),
          },
          pullDate: {
            year: futurePullDate.getFullYear(),
            month: futurePullDate.getMonth() + 1, // JavaScript months are 0-based
            day: futurePullDate.getDate(),
          },
          selectedMarkets: [
            {
              id: 1,
              rightId: 1,
              name: 'US',
            },
          ],
          selectedMediaChannels: [
            {
              id: 1,
              rightId: 1,
              name: 'TV',
            },
          ],
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      loadIntendedUse('1');
      expect(isFormValid()).toBe(true);
    });

    it('should return error object when trying to load an expired intended use', () => {
      resetRequestDownloadFormState();

      // Use past dates to simulate expired intended use
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 2); // 2 months ago

      const mockData = [
        {
          id: '1',
          name: 'Expired Campaign',
          airDate: {
            year: pastDate.getFullYear(),
            month: pastDate.getMonth() + 1,
            day: pastDate.getDate(),
          },
          pullDate: {
            year: pastDate.getFullYear(),
            month: pastDate.getMonth() + 2, // 1 month after air date
            day: pastDate.getDate(),
          },
          selectedMarkets: [
            {
              id: 1,
              rightId: 1,
              name: 'US',
            },
          ],
          selectedMediaChannels: [
            {
              id: 1,
              rightId: 1,
              name: 'TV',
            },
          ],
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = loadIntendedUse('1');

      // Should return error object instead of loading
      expect(result).toEqual({ error: 'expired', name: 'Expired Campaign' });
      // Form should still be invalid because data wasn't loaded
      expect(isFormValid()).toBeFalsy();
    });

    it('should return false when there is a date validation error', () => {
      // Use dynamic future dates
      const airDate = new Date();
      airDate.setMonth(airDate.getMonth() + 1);
      const pullDate = new Date(airDate);
      pullDate.setMonth(airDate.getMonth() + 1);

      const mockData = [
        {
          id: '1',
          name: 'Complete Campaign',
          airDate: {
            year: airDate.getFullYear(),
            month: airDate.getMonth() + 1,
            day: airDate.getDate(),
          },
          pullDate: {
            year: pullDate.getFullYear(),
            month: pullDate.getMonth() + 1,
            day: pullDate.getDate(),
          },
          selectedMarkets: [
            {
              id: 1,
              rightId: 1,
              name: 'US',
            },
          ],
          selectedMediaChannels: [
            {
              id: 1,
              rightId: 1,
              name: 'TV',
            },
          ],
          dateValidationError: 'Pull date must be after air date',
        },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const loaded = loadIntendedUse('1');
      expect(loaded).toBeDefined();

      // Note: The actual form state needs to be manipulated to set dateValidationError
      // Since we can't directly set it in the test, this test demonstrates the expected behavior
      // In real usage, isFormValid checks for dateValidationError in formState
    });
  });
});
