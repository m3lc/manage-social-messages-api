'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Create tasks table
      await queryInterface.sequelize.query(
        `
        CREATE TABLE audits (
          id BIGINT GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "audits_id_seq"),
          event VARCHAR(100) NOT NULL,
          data JSONB,
          "createdBy" VARCHAR(255),
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "audits_pk" PRIMARY KEY (id)
        );
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
        DROP TABLE IF EXISTS audits;
      `,
        { transaction }
      );
    });
  },
};
