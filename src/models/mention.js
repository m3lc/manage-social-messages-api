// @ts-check
import { Model } from 'sequelize';

/**
 * @typedef {Object} MentionData
 * @property {Object} [socialMediaPayload] - Raw payload from social media platform
 */

/**
 * Mention model
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('sequelize').DataTypes} DataTypes
 */
export default (sequelize, DataTypes) => {
  class Mention extends Model {
    static associate(models) {
      // Define associations here if needed
    }
  }

  Mention.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      content: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      socialMediaPlatformRef: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      socialMediaAPIPostRef: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      platform: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      disposition: {
        type: DataTypes.STRING,
      },
      state: {
        type: DataTypes.STRING,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'JSON data structure: { socialMediaPayload: object }',
        validate: {
          isValidStructure(value) {
            if (value === null || value === undefined) {
              return; // Allow null/undefined
            }

            if (typeof value !== 'object') {
              throw new Error('data must be an object');
            }

            const allowedKeys = ['socialMediaPayload'];
            const keys = Object.keys(value);

            const invalidKeys = keys.filter((key) => !allowedKeys.includes(key));
            if (invalidKeys.length > 0) {
              throw new Error(
                `data contains invalid keys: ${invalidKeys.join(', ')}. ` +
                  `Only allowed: ${allowedKeys.join(', ')}`
              );
            }
          },
        },
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      mentionId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: 'mentions',
          key: 'id',
        },
      },
    },
    {
      sequelize,
      modelName: 'Mention',
      tableName: 'mentions',
      timestamps: true,
    }
  );

  return Mention;
};
