'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Create mentions table
      await queryInterface.sequelize.query(
        `
        CREATE TABLE mentions (
          id BIGINT GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME "mentions_id_seq"),
          content TEXT NOT NULL,
          "socialMediaPlatformRef" VARCHAR(255) NOT NULL,
          "socialMediaAPIPostRef" VARCHAR(255) NOT NULL,
          "platform" VARCHAR(50) NOT NULL,
          "type" VARCHAR(50) NOT NULL,
          "disposition" VARCHAR(50),
          "state" VARCHAR(50),
          data JSONB,
          "userId" BIGINT,
          "mentionId" BIGINT,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          CONSTRAINT "mentions_users_fk" FOREIGN KEY ("userId")
          REFERENCES "users" (id) MATCH SIMPLE
          ON UPDATE NO ACTION
          ON DELETE RESTRICT,
          CONSTRAINT "mentions_mentions_fk" FOREIGN KEY ("mentionId")
          REFERENCES "mentions" (id) MATCH SIMPLE
          ON UPDATE CASCADE
          ON DELETE CASCADE,
          CONSTRAINT "mentions_pk" PRIMARY KEY (id)
        );
      `,
        { transaction }
      );

      // Add index on userId foreign key
      await queryInterface.sequelize.query(
        `
        CREATE INDEX mentions_users_fk ON mentions("userId");
      `,
        { transaction }
      );

      // Add index on mentionId foreign key
      await queryInterface.sequelize.query(
        `
        CREATE INDEX mentions_mentions_fk ON mentions("mentionId");
      `,
        { transaction }
      );

      // Add unique index on socialMediaPlatformRef
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX mentions_socialmediaplatformref_unq ON mentions("socialMediaPlatformRef");
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
        DROP TABLE IF EXISTS mentions;
      `,
        { transaction }
      );

      // Drop sequence
      await queryInterface.sequelize.query(
        `
        DROP SEQUENCE IF EXISTS mentions_id_seq;
      `,
        { transaction }
      );
    });
  },
};
