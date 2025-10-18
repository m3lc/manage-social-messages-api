// @ts-check

import { exponentialBackoff } from '#@services/utils/exponential-backoff.js';
import { createLogger } from '#@services/utils/logger/index.js';

const logger = createLogger('http-retry');
const defaultLoggerFn = (...args) => logger.info(...args);

/**
 * Determines if an HTTP error should trigger a retry
 * @param {Error & { response?: { status: number } }} error - The error from the HTTP request
 * @returns {boolean} True if the request should be retried
 */
export const shouldRetryHttpError = (error) => {
  // Network errors (no response received)
  if (!error.response) {
    return true;
  }

  const status = error.response.status;

  // Retry on 5xx server errors or 429 rate limit
  return status >= 500 || status === 429;
};

/**
 * Decorates an HTTP client instance with exponential backoff retry logic
 * @param {any} httpClient - HTTP client instance (e.g., axios)
 * @param {Object} [options] - Retry configuration options
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in milliseconds
 * @param {number} [options.maxDelay=10000] - Maximum delay in milliseconds
 * @param {number} [options.factor=2] - Exponential backoff factor
 * @param {(...args: any[]) => void} [options.logger] - Custom logger function (defaults to internal logger)
 * @param {(error: Error) => boolean} [options.shouldRetry] - Custom retry condition function
 * @returns {any} Decorated HTTP client with retry support
 */
export const withRetry = (httpClient, options = {}) => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    factor = 2,
    logger = defaultLoggerFn,
    shouldRetry = shouldRetryHttpError,
  } = options;

  // Create a wrapper that intercepts HTTP methods
  /**
   * @param {string} method
   */
  const createRetryWrapper = (method) => {
    /**
     * @param {string} url
     * @param {...any} args
     */
    return (url, ...args) => {
      const retryableFn = exponentialBackoff({
        fn: async () => httpClient[method](url, ...args),
        maxRetries,
        initialDelay,
        maxDelay,
        factor,
        logger,
        ctxData: { method: method.toUpperCase(), url },
        shouldRetry,
      });

      return retryableFn();
    };
  };

  // Return a proxy that wraps common HTTP methods
  return {
    ...httpClient,
    get: createRetryWrapper('get'),
    post: createRetryWrapper('post'),
    put: createRetryWrapper('put'),
    patch: createRetryWrapper('patch'),
    delete: createRetryWrapper('delete'),
    head: createRetryWrapper('head'),
    options: createRetryWrapper('options'),
    // Keep the original request method available without retry
    request: httpClient.request.bind(httpClient),
    // Expose the original client for advanced use cases
    _originalClient: httpClient,
  };
};
