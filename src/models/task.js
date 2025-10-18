// @ts-check
import { Model } from 'sequelize';

/**
 * @typedef {Object} MentionData
 * @property {Object} [socialMediaPayload] - Raw payload from social media platform
 */

/**
 * Task model
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('sequelize').DataTypes} DataTypes
 */
export default (sequelize, DataTypes) => {
  class Task extends Model {
    static associate(models) {
      // Define associations here if needed
    }
  }

  Task.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      finishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      createdBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Task',
      tableName: 'tasks',
      timestamps: true,
    }
  );

  return Task;
};
