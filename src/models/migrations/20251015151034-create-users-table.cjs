// @ts-check
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // await queryInterface.sequelize.query(`
    //   CREATE SEQUENCE IF NOT EXISTS users_id_seq;
    // `);

    await queryInterface.createTable('users', {
      id: {
        type: 'BIGINT GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "users_id_seq")',
        primaryKey: true,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add index on email for faster lookups
    await queryInterface.addIndex('users', ['email'], {
      unique: true,
      name: 'users_email_unq'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query(`
      DROP SEQUENCE IF EXISTS users_id_seq;
    `);
  }
};
