// @ts-check

import stringify from 'json-stringify-safe';

/**
 * @param {Object} obj
 * @returns {string}
 */
export function safeStringify(obj) {
  let result = '';
  try {
    result = stringify(obj);
  } catch (err) {
    result = 'Error stringifying object';
  }
  return result;
}
