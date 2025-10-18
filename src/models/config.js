// @ts-check

import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_DIALECT } from '#@/config.js';
import { createLogger } from '#@services/utils/logger/index.js';

const logger = createLogger('db');

export default {
  development: {
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    host: DB_HOST,
    port: DB_PORT,
    dialect: DB_DIALECT,
    logging: (...msg) => logger.info(msg[0], msg[1]['bind'] || ''),
  },
};
