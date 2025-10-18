// @ts-check

/**
 * Processes entities in batches with controlled concurrency
 * @param {Object} params
 * @param {(args: { entity: any, index: number, entities: any[], promises: Promise<any>[], data: any[] }) => Promise<any>} params.promiseFunc - Function that returns a promise for each entity
 * @param {any[]} params.entities - Array of entities to process
 * @param {number} params.promisesLimit - Maximum number of concurrent promises
 * @param {boolean} [params.breakOnError=true] - Whether to stop on first error
 * @param {number | (() => number)} [params.delay=0] - Delay between batches (ms or function)
 * @param {(error: Error, context?: any) => void} [params.onError] - Error handler callback
 * @returns {Promise<any[]>} Array of results
 *
 * @example
 * // Basic usage
 * const results = await processPromises({
 *   promiseFunc: async ({ entity }) => await api.fetch(entity.id),
 *   entities: items,
 *   promisesLimit: 10
 * });
 *
 * @example
 * // With progress logging using index
 * const results = await processPromises({
 *   promiseFunc: async ({ entity, index, entities }) => {
 *     if ((index + 1) % 10 === 0) {
 *       console.log(`Progress: ${index + 1}/${entities.length}`);
 *     }
 *     return await api.fetch(entity.id);
 *   },
 *   entities: items,
 *   promisesLimit: 10
 * });
 *
 * @example
 * // With error handling and delay
 * const results = await processPromises({
 *   promiseFunc: async ({ entity, index, data }) => {
 *     // Use previous results for context
 *     const prevIds = data.map(d => d?.id).filter(Boolean);
 *     return await api.fetchWithContext(entity.id, { prevIds });
 *   },
 *   entities: items,
 *   promisesLimit: 5,
 *   delay: 1000, // 1 second between batches
 *   breakOnError: false,
 *   onError: (error, context) => {
 *     console.error('Failed:', error.message, context);
 *   }
 * });
 */
export async function processPromises({
  promiseFunc,
  entities,
  promisesLimit,
  breakOnError = true,
  delay = 0,
  onError = () => {},
}) {
  const promises = [];
  const data = [];

  // Consolidated error handler
  const handleError = (err) => {
    if (breakOnError) {
      throw err;
    } else {
      onError(err);
    }
  };

  for (let index = 0; index < entities.length; index++) {
    const entity = entities[index];
    try {
      // eslint-disable-next-line no-await-in-loop
      await handlePromise({
        promise: breakOnError
          ? promiseFunc({ entity, index, entities, promises, data })
          : promiseFunc({ entity, index, entities, promises, data }).catch((err) =>
              onError(err, { entity, index, entities, promises, data })
            ),
        data,
        promises,
        promisesLimit,
        delay,
      });
    } catch (err) {
      handleError(err);
    }
  }

  // Process remaining promises in batch
  if (promises.length) {
    try {
      const result = await Promise.all(promises);
      data.push(...result);
    } catch (err) {
      handleError(err);
    }
  }

  return data;
}

/**
 * Handles promise batching and execution
 * @param {Object} params
 * @param {Promise<any>} params.promise - Promise to add to batch
 * @param {any[]} params.data - Array to collect results
 * @param {Promise<any>[]} params.promises - Array of pending promises
 * @param {number} params.promisesLimit - Batch size limit
 * @param {number | (() => number)} params.delay - Delay between batches
 */
async function handlePromise({ promise, data, promises, promisesLimit, delay }) {
  promises.push(promise);
  if (promises.length >= promisesLimit) {
    const result = await Promise.all(promises);
    data.push(...result);
    promises.splice(0, promises.length);
    if (delay) {
      await new Promise((resolve) =>
        setTimeout(resolve, delay instanceof Function ? delay() : delay)
      );
    }
  }
}
