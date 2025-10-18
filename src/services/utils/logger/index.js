// @ts-check

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeStringify } from '#@services/utils/safe-stringify.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Project identifier - prepended to all log namespaces
const PROJECT_ID = 'msm-api';

// Custom log format
const logFormat = printf(({ level, message, timestamp, namespace, ...metadata }) => {
  let log = `${timestamp} [${level}]`;

  if (namespace) {
    log += ` [${namespace}]`;
  }

  log += `: ${message}`;

  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    log += ` ${safeStringify(metadata)}`;
  }

  return log;
});

// Custom Console transport that uses native console methods
// This makes logs visible in Chrome DevTools when debugging Node.js
class NativeConsoleTransport extends winston.transports.Console {
  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    // Get the formatted message (format is applied at logger level)
    const output = info[Symbol.for('message')] || safeStringify(info);

    // Use native console methods (visible in Chrome DevTools)
    switch (info.level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }

    if (callback) callback();
  }
}

// Base Winston logger configuration
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    colorize(),
    logFormat
  ),
  transports: [new NativeConsoleTransport()],
});

/**
 * Creates a namespaced logger
 * @param {string} namespace - Namespace for the logger (e.g., file name or module name)
 * @returns {Object} Logger instance with info, warn, error, debug methods
 *
 * @example
 * // Using with file URL (ES modules)
 * import { createLogger } from '#@services/utils/logger/index.js';
 * const logger = createLogger(import.meta.url);
 * logger.info('Server started');
 *
 * @example
 * // Using with custom namespace
 * import { createLogger } from '#@services/utils/logger/index.js';
 * const logger = createLogger('AuthService');
 * logger.error('Authentication failed', { userId: 123 });
 */
export function createLogger(namespace) {
  // If namespace is a file URL, extract the filename
  let loggerName = namespace;

  if (namespace.startsWith('file://')) {
    const filepath = fileURLToPath(namespace);
    const filename = path.basename(filepath, path.extname(filepath));
    const dirname = path.basename(path.dirname(filepath));
    loggerName = `${dirname}/${filename}`;
  }

  // Prepend project identifier
  const fullNamespace = `${PROJECT_ID}:${loggerName}`;

  // Create a child logger with the namespace
  const childLogger = baseLogger.child({ namespace: fullNamespace });

  // Helper to format multiple arguments like console.log
  const formatArgs = (...args) => {
    if (args.length === 0) return ['', {}];
    if (args.length === 1) return [args[0], {}];

    // If last arg is an object (and not an array or null), treat it as metadata
    const lastArg = args[args.length - 1];
    const isLastArgMetadata =
      lastArg !== null && typeof lastArg === 'object' && !Array.isArray(lastArg);

    if (isLastArgMetadata && args.length >= 2) {
      // Join all args except last as message, use last as metadata
      const message = args
        .slice(0, -1)
        .map((arg) => (typeof arg === 'object' ? safeStringify(arg) : String(arg)))
        .join(' ');
      return [message, lastArg];
    }

    // Join all args as message, no metadata
    const message = args
      .map((arg) => (typeof arg === 'object' ? safeStringify(arg) : String(arg)))
      .join(' ');
    return [message, {}];
  };

  return {
    info: (...args) => {
      const [message, meta] = formatArgs(...args);
      childLogger.info(message, meta);
    },
    warn: (...args) => {
      const [message, meta] = formatArgs(...args);
      childLogger.warn(message, meta);
    },
    error: (...args) => {
      const [message, meta] = formatArgs(...args);
      childLogger.error(message, meta);
    },
    debug: (...args) => {
      const [message, meta] = formatArgs(...args);
      childLogger.debug(message, meta);
    },
    log: (...args) => {
      const [message, meta] = formatArgs(...args);
      childLogger.info(message, meta);
    },

    // Expose the underlying logger for advanced use cases
    _logger: childLogger,
  };
}

/**
 * Get the base logger instance for advanced configuration
 */
export function getBaseLogger() {
  return baseLogger;
}

/**
 * Default export for convenience
 */
export default createLogger;
