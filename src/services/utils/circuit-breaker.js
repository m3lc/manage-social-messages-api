// @ts-check

import { createLogger } from '#@services/utils/logger/index.js';

const defaultLogger = createLogger('circuit-breaker');

export const CIRCUIT_STATE = {
  CLOSED: 'CLOSED', // Normal operation, requests go through
  OPEN: 'OPEN', // Circuit is open, reject requests immediately
  HALF_OPEN: 'HALF_OPEN', // Testing if service recovered
};

/**
 * @typedef {Function} CircuitBreakerExecute
 * @property {() => string} getState - Returns the current circuit breaker state
 */

/**
 * Creates a circuit breaker function wrapper with optional distributed state support
 * @param {Object} params - Configuration parameters
 * @param {Function} [params.fn] - Optional default function to wrap with circuit breaker logic
 * @param {number} [params.maxFailures=5] - Maximum number of failures before opening the circuit
 * @param {number} [params.resetTimeout=60000] - Time in milliseconds before attempting half-open state
 * @param {string} [params.stateKey] - Unique key for distributed state (required if using loadStateFn/saveStateFn)
 * @param {Function} [params.loadStateFn] - Async function to load initial state: (stateKey) => Promise<StateObject>
 * @param {Function} [params.saveStateFn] - Async function to save state: (stateKey, state) => Promise<void>
 * @param {Function} [params.onStateChange] - Optional callback when circuit state changes: (newState, stateData) => void
 * @param {Object} [params.logger] - Logger object with error method for logging errors (defaults to internal logger)
 * @returns {CircuitBreakerExecute} An async function that executes fn with circuit breaker protection, with getState() method
 *
 * @example
 * // Local circuit breaker
 * const breaker = circuitBreaker({ fn: fetchData, maxFailures: 3 });
 *
 * @example
 * // Distributed circuit breaker (shared across service nodes)
 * const breaker = circuitBreaker({
 *   fn: fetchData,
 *   stateKey: 'external-api-circuit',
 *   loadStateFn: async (key) => await redis.get(key),
 *   saveStateFn: async (key, state) => await redis.set(key, state, { EX: 120 }),
 *   onStateChange: (state, data) => logger.info('Circuit state changed', { state, data }),
 *   logger: customLogger // Optional: winston, pino, or custom logger
 * });
 */
export function circuitBreaker({
  fn,
  maxFailures = 5,
  resetTimeout = 60000,
  stateKey = null,
  loadStateFn = null,
  saveStateFn = null,
  onStateChange = null,
  logger = defaultLogger,
}) {
  // Local state (used as fallback if distributed state fails)
  let localState = {
    state: CIRCUIT_STATE.CLOSED,
    failures: 0,
    lastFailureTime: null,
    nextAttemptTime: null,
  };

  let stateInitialized = false;

  // Load initial state from external source
  const initializeState = async () => {
    if (stateInitialized) return;
    stateInitialized = true;

    if (loadStateFn && stateKey) {
      try {
        const externalState = await loadStateFn(stateKey);
        if (externalState) {
          // Merge external state with local state
          localState = {
            state: externalState.state || CIRCUIT_STATE.CLOSED,
            failures: externalState.failures || 0,
            lastFailureTime: externalState.lastFailureTime || null,
            nextAttemptTime: externalState.nextAttemptTime || null,
          };
        }
      } catch (error) {
        // Graceful degradation: if loading fails, use local state
        logger.error(`Failed to load circuit breaker state for key "${stateKey}":`, error.message);
      }
    }
  };

  // Persist state to external source (non-blocking)
  const persistState = () => {
    if (saveStateFn && stateKey) {
      // Fire and forget - don't wait for save to complete
      // Supports both sync and async saveStateFn, catches both throws and rejections
      Promise.resolve()
        .then(() =>
          saveStateFn(stateKey, {
            state: localState.state,
            failures: localState.failures,
            lastFailureTime: localState.lastFailureTime,
            nextAttemptTime: localState.nextAttemptTime,
            timestamp: Date.now(),
          })
        )
        .catch((error) => {
          logger.error(`Failed to save circuit breaker state for key "${stateKey}":`, error.message);
        });
    }
  };

  const changeState = (newState) => {
    if (localState.state !== newState) {
      localState.state = newState;

      // Trigger callbacks (non-blocking, supports both sync and async)
      if (onStateChange) {
        Promise.resolve()
          .then(() =>
            onStateChange(newState, {
              failures: localState.failures,
              lastFailureTime: localState.lastFailureTime,
              nextAttemptTime: localState.nextAttemptTime,
            })
          )
          .catch((error) => {
            logger.error(
              `Failed to trigger state change callback for key "${stateKey}":`,
              error.message
            );
          });
      }

      // Persist to external state (non-blocking)
      persistState();
    }
  };

  const execute = async (fnOverride, ...args) => {
    // Initialize state from external source on first call
    await initializeState();

    const now = Date.now();

    // Determine which function to execute
    const executeFunction = async () => {
      if (typeof fnOverride === 'function') {
        return await fnOverride(...args);
      } else if (fn) {
        return await fn(fnOverride, ...args);
      } else {
        throw new Error('No function provided to circuit breaker');
      }
    };

    // If circuit is OPEN, check if we should transition to HALF_OPEN
    if (localState.state === CIRCUIT_STATE.OPEN) {
      if (now >= localState.nextAttemptTime) {
        changeState(CIRCUIT_STATE.HALF_OPEN);
      } else {
        // Circuit is still open, reject immediately
        const waitTime = Math.ceil((localState.nextAttemptTime - now) / 1000);
        throw new Error(
          `Circuit breaker is OPEN. ${localState.failures} consecutive failures. ` +
            `Retry in ${waitTime}s.`
        );
      }
    }

    // Execute the function
    try {
      const result = await executeFunction();

      // Success! Reset everything
      localState.failures = 0;
      localState.lastFailureTime = null;
      localState.nextAttemptTime = null;
      changeState(CIRCUIT_STATE.CLOSED);

      return result;
    } catch (error) {
      localState.failures++;
      localState.lastFailureTime = now;

      // Open circuit if in HALF_OPEN or reached max failures in CLOSED
      const shouldOpenCircuit =
        localState.state === CIRCUIT_STATE.HALF_OPEN || localState.failures >= maxFailures;

      if (shouldOpenCircuit) {
        localState.nextAttemptTime = now + resetTimeout;
        changeState(CIRCUIT_STATE.OPEN);

        const reason =
          localState.state === CIRCUIT_STATE.HALF_OPEN
            ? 'Circuit breaker reopened after failed test in HALF_OPEN state.'
            : `Circuit breaker opened after ${localState.failures} consecutive failures.`;

        throw new Error(
          `${reason} ` +
            `Will retry in ${Math.ceil(resetTimeout / 1000)}s. ` +
            `Original error: ${error.message || String(error)}`
        );
      }

      // Still in CLOSED, but haven't hit max failures yet
      // Persist incremental failure count (non-blocking)
      persistState();
      throw error;
    }
  };

  // Expose state getter for external use (e.g., retry logic)
  execute.getState = () => localState.state;

  return execute;
}
