// @ts-check

import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_DIALECT } from '#@/config.js';
import { createLogger } from '#@services/utils/logger/index.js';

const logger = createLogger('db');

const config = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  dialect: process.env.DB_DIALECT || 'postgres',
  logging: (...msg) => logger.info(msg[0], msg[1]['bind'] || ''),
};

export default {
  development: config,
  test: config,
  production: config,
};
