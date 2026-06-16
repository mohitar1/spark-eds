/**
 * Tests for api-client.js
 */

import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import makeRequest from '../api-client.js';

describe('api-client', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('makeRequest', () => {
    describe('basic request handling', () => {
      it('should make GET request by default', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({ data: 'test' }),
        });

        await makeRequest({ url: '/test' });

        expect(mockFetch).toHaveBeenCalledWith('/api/test', {
          method: 'GET',
          headers: {},
        });
      });

      it('should prepend /api to URL', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/custom/endpoint' });

        expect(mockFetch).toHaveBeenCalledWith('/api/custom/endpoint', expect.any(Object));
      });

      it('should use specified HTTP method', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/test', method: 'DELETE' });

        expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
          method: 'DELETE',
        }));
      });
    });

    describe('POST/PUT request handling', () => {
      it('should add Content-Type header for POST requests', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/test', method: 'POST', data: { key: 'value' } });

        expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'value' }),
        }));
      });

      it('should add Content-Type header for PUT requests', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/test', method: 'PUT', data: { key: 'value' } });

        expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        }));
      });

      it('should stringify data as JSON body', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        const testData = { nested: { object: true }, array: [1, 2, 3] };
        await makeRequest({ url: '/test', method: 'POST', data: testData });

        expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
          body: JSON.stringify(testData),
        }));
      });
    });

    describe('URL params handling', () => {
      it('should append query params to URL', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/test', params: { foo: 'bar', baz: 'qux' } });

        expect(mockFetch).toHaveBeenCalledWith('/api/test?foo=bar&baz=qux', expect.any(Object));
      });

      it('should skip undefined param values', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/test', params: { foo: 'bar', skip: undefined } });

        expect(mockFetch).toHaveBeenCalledWith('/api/test?foo=bar', expect.any(Object));
      });

      it('should convert param values to strings', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/test', params: { num: 42, bool: true } });

        expect(mockFetch).toHaveBeenCalledWith('/api/test?num=42&bool=true', expect.any(Object));
      });

      it('should not add ? when params result in empty string', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({ url: '/test', params: { skip: undefined } });

        expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
      });
    });

    describe('custom headers', () => {
      it('should merge custom headers', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({}),
        });

        await makeRequest({
          url: '/test',
          headers: { Authorization: 'Bearer token', 'X-Custom': 'value' },
        });

        expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
          headers: { Authorization: 'Bearer token', 'X-Custom': 'value' },
        }));
      });
    });

    describe('error handling', () => {
      it('should throw error on non-ok response', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

        await expect(makeRequest({ url: '/test' })).rejects.toThrow('Request failed: Not Found');
      });

      it('should return undefined on non-ok when allowUndefinedResponse is true', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

        const result = await makeRequest({ url: '/test', allowUndefinedResponse: true });

        expect(result).toBeUndefined();
      });

      it('should re-throw Error instances', async () => {
        const testError = new Error('Network error');
        mockFetch.mockRejectedValue(testError);

        await expect(makeRequest({ url: '/test' })).rejects.toThrow('Network error');
      });

      it('should wrap non-Error throws in Error', async () => {
        mockFetch.mockRejectedValue('string error');

        await expect(makeRequest({ url: '/test' })).rejects.toThrow('Request failed');
      });
    });

    describe('response type handling', () => {
      it('should return empty object for empty response (content-length 0)', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-length', '0']]),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual({});
      });

      it('should return undefined for empty response when allowUndefinedResponse', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-length', '0']]),
        });

        const result = await makeRequest({ url: '/test', allowUndefinedResponse: true });

        expect(result).toBeUndefined();
      });

      it('should return empty object for 204 status', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 204,
          headers: new Map(),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual({});
      });

      it('should parse JSON for application/json content type', async () => {
        const responseData = { key: 'value', nested: { data: true } };
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve(responseData),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual(responseData);
      });

      it('should handle text responses with JSON content', async () => {
        const jsonString = '{"key": "value"}';
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve(jsonString),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual({ key: 'value' });
      });

      it('should handle text responses starting with array', async () => {
        const jsonString = '[1, 2, 3]';
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve(jsonString),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual([1, 2, 3]);
      });

      it('should return plain text when not JSON', async () => {
        const textContent = 'Plain text response';
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve(textContent),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toBe(textContent);
      });

      it('should return undefined for plain text when allowUndefinedResponse', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/html']]),
          text: () => Promise.resolve('<html>page</html>'),
        });

        const result = await makeRequest({ url: '/test', allowUndefinedResponse: true });

        expect(result).toBeUndefined();
      });

      it('should handle application/text content type', async () => {
        const jsonString = '{"test": true}';
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/text']]),
          text: () => Promise.resolve(jsonString),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual({ test: true });
      });

      it('should return undefined when text JSON parse fails and allowUndefinedResponse', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve('{invalid json'),
        });

        const result = await makeRequest({ url: '/test', allowUndefinedResponse: true });

        expect(result).toBeUndefined();
      });

      it('should return text when JSON parse fails', async () => {
        const invalidJson = '{invalid json';
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve(invalidJson),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toBe(invalidJson);
      });

      it('should attempt JSON parsing for unknown content type', async () => {
        const responseData = { data: 'test' };
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/octet-stream']]),
          json: () => Promise.resolve(responseData),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual(responseData);
      });

      it('should throw error when JSON parse fails for unknown content type', async () => {
        // Note: The try-catch in api-client.js doesn't catch Promise rejections
        // since response.json() returns a Promise. The rejection propagates.
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/octet-stream']]),
          json: () => Promise.reject(new Error('Invalid JSON')),
        });

        await expect(makeRequest({ url: '/test' })).rejects.toThrow('Invalid JSON');
      });

      it('should throw error when JSON parse fails for unknown content type even with allowUndefinedResponse', async () => {
        // Note: allowUndefinedResponse doesn't help here because the rejection happens
        // after the return statement
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/octet-stream']]),
          json: () => Promise.reject(new Error('Invalid JSON')),
        });

        await expect(makeRequest({ url: '/test', allowUndefinedResponse: true })).rejects.toThrow('Invalid JSON');
      });

      it('should handle null content-type', async () => {
        const responseData = { key: 'value' };
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Map(),
          json: () => Promise.resolve(responseData),
        });

        const result = await makeRequest({ url: '/test' });

        expect(result).toEqual(responseData);
      });
    });
  });
});
