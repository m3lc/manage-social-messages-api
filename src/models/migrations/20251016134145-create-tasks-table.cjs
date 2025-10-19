'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Create tasks table
      await queryInterface.sequelize.query(
        `
        CREATE TABLE tasks (
          id BIGINT GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "tasks_id_seq"),
          code VARCHAR(50) NOT NULL,
          data JSONB,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "startedAt" TIMESTAMP WITH TIME ZONE,
          "finishedAt" TIMESTAMP WITH TIME ZONE,
          "createdBy" VARCHAR(255),
          CONSTRAINT "tasks_pk" PRIMARY KEY (id)
        );
      `,
        { transaction }
      );

      // Add index on createdBy
      await queryInterface.sequelize.query(
        `
        CREATE INDEX tasks_createdby_idx ON tasks("createdBy");
      `,
        { transaction }
      );

      // Add index on code
      await queryInterface.sequelize.query(
        `
        CREATE INDEX tasks_code_idx ON tasks(code);
      `,
        { transaction }
      );

      // Add index on data
      await queryInterface.sequelize.query(
        `
        CREATE INDEX tasks_data_idx ON tasks USING GIN(data);
      `,
        { transaction }
      );

      // Create unique partial index on task code REPLY_MENTION and data->>'mentionId'
      // to ensure that only one reply task is created for a mention
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX tasks_code_data_mentionid_idx ON tasks(code, (data->>'mentionId')) WHERE code = 'REPLY_MENTION';
      `,
        { transaction }
      );

      // create unique partial index to avoid duplicate content on the same mention
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX tasks_code_data_mentionid_content_idx ON tasks(code, (data->>'mentionId'), (data->>'content')) WHERE code = 'REPLY_MENTION';
      `,
        { transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Drop table (this will automatically drop constraints and indexes)
      await queryInterface.sequelize.query(
        `
        DROP TABLE IF EXISTS tasks;
      `,
        { transaction }
      );

      // Drop sequence
      await queryInterface.sequelize.query(
        `
        DROP SEQUENCE IF EXISTS tasks_id_seq;
      `,
        { transaction }
      );
    });
  },
};
