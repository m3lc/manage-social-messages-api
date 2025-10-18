// @ts-check

import { Sequelize } from 'sequelize';
import process from 'process';
import { NODE_ENV } from '#@/config.js';
import { initModels } from '#@models/utils/init-models.js';
import { initAssociations } from '#@models/utils/init-associations.js';

const env = NODE_ENV;

// Import config
const configModule = await import('#@models/config.js');
const config = configModule.default[env];

// Create Sequelize instance
let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable] || '', config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// Initialize all models and attach them to sequelize instance
await initModels(sequelize);

// Initialize associations
initAssociations(sequelize.models);

// Export sequelize instance with models attached
// Now you can use: db.query(), db.User, db.Post, etc.
export { sequelize as db };
