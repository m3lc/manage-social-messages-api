// @ts-check
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Create users table
      await queryInterface.sequelize.query(
        `
        CREATE TABLE users (
          id BIGINT GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "users_id_seq"),
          email VARCHAR(255) NOT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          CONSTRAINT "users_pk" PRIMARY KEY (id)
        );
      `,
        { transaction }
      );

      // Add unique index on email
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX users_email_unq ON users(email);
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
        DROP TABLE IF EXISTS users;
      `,
        { transaction }
      );

      // Drop sequence
      await queryInterface.sequelize.query(
        `
        DROP SEQUENCE IF EXISTS users_id_seq;
      `,
        { transaction }
      );
    });
  },
};
