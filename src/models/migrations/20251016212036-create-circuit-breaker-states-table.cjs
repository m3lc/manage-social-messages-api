'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Create tasks table
      await queryInterface.sequelize.query(
        `
        CREATE TABLE circuit_breaker_states (
          id BIGINT GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "circuit_breaker_states_id_seq"),
          circuit_name VARCHAR(50) NOT NULL,
          state_data JSONB NOT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "circuit_breaker_states_circuit_name_unique" UNIQUE (circuit_name),
          CONSTRAINT "circuit_breaker_states_pk" PRIMARY KEY (id)
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
        DROP TABLE IF EXISTS circuit_breaker_states;
      `,
        { transaction }
      );
    });
  },
};
