// @ts-check

import { sleep } from '#@services/utils/sleep.js';
import { createLogger } from '#@services/utils/logger/index.js';

const logger = createLogger('exponential-backoff');
const defaultLoggerFn = (...args) => logger.info(...args);

/**
 * Executes a function with exponential backoff retry logic
 * @param {Object} params - Configuration parameters
 * @param {Function} [params.fn] - Optional default function to execute with retry logic
 * @param {number} [params.maxRetries=5] - Maximum number of retry attempts
 * @param {number} [params.initialDelay=1000] - Initial delay in milliseconds between retries
 * @param {number} [params.maxDelay=10000] - Maximum delay in milliseconds between retries
 * @param {number} [params.factor=2] - Multiplier for exponential backoff delay
 * @param {Function} [params.logger] - Logger function for retry attempts (defaults to internal logger)
 * @param {Object} [params.ctxData={}] - Additional context data for logging
 * @param {Function} [params.shouldRetry] - Optional function to determine if error should trigger retry
 * @returns {Function} An async function that can accept a function override or arguments
 *
 * @example
 * // Pattern 1: Lock in a specific function call
 * const retry1 = exponentialBackoff({ fn: () => fetchUser(123), maxRetries: 3 });
 * await retry1(); // Always fetches user 123
 *
 * @example
 * // Pattern 2: Configure a function and pass different arguments
 * const retry2 = exponentialBackoff({ fn: fetchUser, maxRetries: 3 });
 * await retry2(123); // Fetches user 123
 * await retry2(456); // Fetches user 456
 *
 * @example
 * // Pattern 3: Configure retry settings only, override function at execution
 * const retry3 = exponentialBackoff({ maxRetries: 3, initialDelay: 2000 });
 * await retry3(() => fetchUser(123));
 * await retry3(() => fetchPost(789));
 * await retry3(async () => { const data = await getData(); return data; });
 */
export function exponentialBackoff({
  fn,
  maxRetries = 5,
  initialDelay = 1000,
  maxDelay = 10000,
  factor = 2,
  logger = defaultLoggerFn,
  ctxData = {},
  shouldRetry = () => true,
}) {
  return async (fnOverride, ...args) => {
    // Determine which function to execute
    // If fnOverride is provided and is a function, use it
    // Otherwise use the configured fn with any passed arguments
    const executeFunction = async () => {
      if (typeof fnOverride === 'function') {
        return await fnOverride(...args);
      } else if (fn) {
        return await fn(fnOverride, ...args);
      } else {
        throw new Error('No function provided to execute');
      }
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await executeFunction();
      } catch (error) {
        // Don't retry if we've exhausted attempts or if shouldRetry returns false
        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = initialDelay * Math.pow(factor, attempt);
        const jitter = Math.ceil(Math.random() * 1000);
        const waitTime = Math.min(exponentialDelay + jitter, maxDelay);

        logger(`Retry ${attempt + 1}/${maxRetries} after ${waitTime}ms`, {
          ...ctxData,
          error: error.message || String(error),
        });

        await sleep(waitTime);
      }
    }
  };
}
