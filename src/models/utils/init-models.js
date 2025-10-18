// @ts-check

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DataTypes } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize all Sequelize models and attach them to the sequelize instance
 * @param {import('sequelize').Sequelize} sequelize - Sequelize instance
 * @returns {Promise<import('sequelize').Sequelize>} Sequelize instance with models attached
 */
export async function initModels(sequelize) {
  const modelsDir = path.join(__dirname, '..');
  const basename = path.basename(__filename);

  // Find all model files
  const files = fs.readdirSync(modelsDir).filter((file) => {
    return (
      !file.startsWith('.') &&
      file !== basename &&
      file !== 'config.js' &&
      file !== 'index.js' &&
      file.endsWith('.js') &&
      !file.endsWith('.test.js') &&
      !fs.statSync(path.join(modelsDir, file)).isDirectory()
    );
  });

  // Load all models
  for (const file of files) {
    const filePath = path.join(modelsDir, file);
    const fileUrl = pathToFileURL(filePath).href;
    const modelModule = await import(fileUrl);
    const model = modelModule.default(sequelize, DataTypes);

    // Attach model to sequelize instance
    sequelize[model.name] = model;
  }

  // Initialize associations
  Object.keys(sequelize.models).forEach((modelName) => {
    const model = sequelize.models[modelName];
    // @ts-ignore - associate is a custom method added to models
    if (model.associate) {
      // @ts-ignore
      model.associate(sequelize.models);
    }
  });

  return sequelize;
}
