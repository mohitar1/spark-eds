/**
 * Retry utilities for async operations
 * Converted from React retryUtils.ts
 */

/**
 * @typedef {Object} RetryOptions
 * @property {number} [maxRetries=3] - Maximum number of retry attempts
 * @property {number} [delayMs=1000] - Delay between retries in milliseconds
 * @property {function(number, number, Error): void} [onRetry] - Callback on each retry
 * @property {function(): void} [onSuccess] - Callback called on success
 * @property {function(Error): void} [onFailure] - Callback called when all retries are exhausted
 */

/**
 * Retries an async function with fixed delay
 * @param {function(): Promise<*>} fn - The async function to retry
 * @param {RetryOptions} [options={}] - Retry configuration options
 * @returns {Promise<*>} Promise resolving with result or rejecting with final error
 */
export async function retryWithDelay(fn, options = {}) {
  const {
    maxRetries = 3,
    delayMs = 1000,
    onRetry,
    onSuccess,
    onFailure,
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await fn();
      if (onSuccess) onSuccess();
      return result;
    } catch (error) {
      lastError = error;

      if (onRetry) {
        onRetry(attempt, maxRetries, lastError);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`Attempt ${attempt}/${maxRetries} failed:`, lastError);
      }

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-console
        console.log(`Retrying in ${delayMs}ms...`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, delayMs); });
      }
    }
  }

  // All retries exhausted
  const finalError = lastError || new Error('Unknown error during retry attempts');
  if (onFailure) onFailure(finalError);
  throw finalError;
}

/**
 * Retries an async function with exponential backoff (delay doubles each time)
 * @param {function(): Promise<*>} fn - The async function to retry
 * @param {RetryOptions} [options={}] - Retry options (delayMs is initial delay)
 * @returns {Promise<*>} Promise resolving with result or rejecting with final error
 */
export async function retryWithExponentialBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    delayMs = 1000,
    onRetry,
    onSuccess,
    onFailure,
  } = options;

  let lastError = null;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await fn();
      if (onSuccess) onSuccess();
      return result;
    } catch (error) {
      lastError = error;

      if (onRetry) {
        onRetry(attempt, maxRetries, lastError);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`Attempt ${attempt}/${maxRetries} failed:`, lastError);
      }

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-console
        console.log(`Retrying in ${currentDelay}ms...`);
        const delayTime = currentDelay;
        // eslint-disable-next-line no-await-in-loop, no-loop-func
        await new Promise((resolve) => { setTimeout(resolve, delayTime); });
        currentDelay *= 2; // Exponential backoff
      }
    }
  }

  // All retries exhausted
  const finalError = lastError || new Error('Unknown error during retry attempts');
  if (onFailure) onFailure(finalError);
  throw finalError;
}

export default {
  retryWithDelay,
  retryWithExponentialBackoff,
};
