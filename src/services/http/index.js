import axios from 'axios';
import { withRetry, shouldRetryHttpError } from '#@services/http/with-retry.js';
import { withLogging } from '#@services/http/with-logging.js';

// Create a default axios instance
const http = axios.create();

export { http, axios, withRetry, withLogging, shouldRetryHttpError };
