// @ts-check

import { createLogger } from '#@services/utils/logger/index.js';
import { nanoid } from 'nanoid';

const logger = createLogger('http-client');

/**
 * Adds logging interceptors to an axios HTTP client instance
 * @param {any} httpClient - Axios HTTP client instance
 * @param {Object} [options] - Logging configuration options
 * @param {boolean} [options.logRequest=true] - Whether to log requests
 * @param {boolean} [options.logResponse=true] - Whether to log responses
 * @param {boolean} [options.logHeaders=false] - Whether to log headers
 * @param {boolean} [options.logData=false] - Whether to log request/response data
 * @param {(message: string, meta: any) => void} [options.customLogger] - Custom logger function
 * @returns {any} HTTP client with logging interceptors attached
 *
 * @example
 * import axios from 'axios';
 * import { withLogging } from '#@services/http/with-logging.js';
 *
 * const http = withLogging(axios.create());
 * const response = await http.get('/api/users');
 *
 * @example
 * // With custom options
 * const http = withLogging(axios.create(), {
 *   logData: true,
 *   logHeaders: true
 * });
 */
export const withLogging = (httpClient, options = {}) => {
  const {
    logRequest = true,
    logResponse = true,
    logHeaders = false,
    logData = false,
    customLogger,
  } = options;

  const log = customLogger || ((message, meta) => logger.info(message, meta));

  // Request interceptor
  httpClient.interceptors.request.use(
    (config) => {
      // Attach metadata for tracking (use existing if provided for correlation)
      config.metadata = config.metadata || {};
      config.metadata.requestId = config.metadata.requestId || nanoid();
      config.metadata.startTime = config.metadata.startTime || Date.now();

      if (logRequest) {
        const requestMeta = {
          requestId: config.metadata.requestId,
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        };

        if (logHeaders && config.headers) {
          requestMeta.headers = config.headers;
        }

        if (logData && config.data) {
          requestMeta.data = config.data;
        }

        log('HTTP Request', requestMeta);
      }

      return config;
    },
    (error) => {
      logger.error('HTTP Request Setup Failed', { error: error.message });
      return Promise.reject(error);
    }
  );

  // Response interceptor
  httpClient.interceptors.response.use(
    (response) => {
      if (logResponse) {
        const duration = Date.now() - response.config.metadata.startTime;
        const responseMeta = {
          requestId: response.config.metadata.requestId,
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          status: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`,
        };

        if (logHeaders && response.headers) {
          responseMeta.headers = response.headers;
        }

        if (logData && response.data) {
          responseMeta.data = response.data;
        }

        log('HTTP Response', responseMeta);
      }

      return response;
    },
    (error) => {
      const config = error.config || {};
      const metadata = config.metadata || { requestId: 'unknown', startTime: Date.now() };
      const duration = Date.now() - metadata.startTime;

      const errorMeta = {
        requestId: metadata.requestId,
        method: config.method?.toUpperCase(),
        url: config.url,
        duration: `${duration}ms`,
        error: error.message,
      };

      if (error.response) {
        errorMeta.status = error.response.status;
        errorMeta.statusText = error.response.statusText;

        if (logData && error.response.data) {
          errorMeta.responseData = error.response.data;
        }
      } else if (error.request) {
        errorMeta.errorType = 'Network Error';
      } else {
        errorMeta.errorType = 'Request Setup Error';
      }

      logger.error('HTTP Request Failed', errorMeta);

      return Promise.reject(error);
    }
  );

  return httpClient;
};
