// @ts-check

/**
 * Integration Test for MentionDataService Reply Concurrency
 *
 * This test verifies that when multiple concurrent reply requests are made
 * to the same mention, only one reply is processed and sent out while
 * the others are properly rejected/ignored.
 */

import { strict as assert } from 'assert';
import { MentionDataService } from '#@/services/data/mention/mention-data-service.js';
import { db } from '#@/models/index.js';
import { taskTypes, mentionTypes } from '#@/enums/index.js';
import { sleep } from '#@/services/utils/sleep.js';
import { Op } from 'sequelize';

describe('MentionDataService Integration Tests', function () {
  this.timeout(30000); // Increase timeout for concurrent operations

  let mockSocialMediaService;
  let mentionDataService;
  let testMention;
  let testUser;

  before(async function () {
    // Initialize the services
    mockSocialMediaService = {
      reply: async ({ mention, content, reqUser }) => {
        // Simulate some processing time
        await sleep(100);
        return {
          status: 'success',
          bluesky: {
            comment: `concurrency test reply-${Date.now()}`,
            commentId: `reply-${Date.now()}`,
          },
        };
      },
    };
    // @ts-ignore - Using partial mock for testing
    mentionDataService = new MentionDataService({ db, socialMediaService: mockSocialMediaService });

    // Create test user
    testUser = await db.User.create({
      name: 'Test User',
      email: 'test@example.com',
    });

    // Create a test mention
    testMention = await db.Mention.create({
      content: 'Test mention content for concurrency test',
      socialMediaPlatformRef: `test-ref-${Date.now()}`,
      socialMediaAPIPostRef: 'test-post-ref',
      platform: 'bluesky',
      type: mentionTypes.COMMENT,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  after(async function () {
    // Clean up test data
    if (testMention) {
      await db.Task.destroy({
        where: {
          data: {
            mentionId: testMention.id,
          },
        },
      });
      await testMention.destroy();
    }

    if (testUser) {
      await testUser.destroy();
    }
  });

  describe('reply() - Concurrency Control', function () {
    it('should allow only one reply to process when 5 concurrent replies are fired', async function () {
      const reqUser = {
        id: testUser.id,
        email: testUser.email,
      };
      const replyContent = 'Test concurrent reply';
      console.log('Firing 5 concurrent reply requests...');
      const startTime = Date.now();
      const replyPromises = Array.from({ length: 5 }, (_, index) =>
        mentionDataService
          .reply({
            mentionId: testMention.id,
            content: `${replyContent} #${index + 1}`,
            reqUser,
          })
          .catch((err) => {
            // Catch any errors to prevent test from failing prematurely
            console.log(`Reply #${index + 1} error:`, err.message);
            return { error: err.message };
          })
      );
      await Promise.all(replyPromises);
      const duration = Date.now() - startTime;
      console.log(`All 5 requests completed in ${duration}ms`);
      // Query all tasks created for this mention
      const tasks = await db.Task.findAll({
        where: {
          code: {
            [Op.in]: [taskTypes.REPLY_MENTION, taskTypes.REPLY_MENTION_IGNORED],
          },
        },
        order: [['createdAt', 'DESC']],
      });
      // Filter tasks for our test mention
      const mentionTasks = tasks.filter(
        (task) => task.data && task.data.mentionId === testMention.id
      );
      console.log('Test Results:');
      console.log(`Total tasks created: ${mentionTasks.length}`);
      // Count processed (not ignored) tasks
      const processedTasks = mentionTasks.filter(
        (task) => task.code !== taskTypes.REPLY_MENTION_IGNORED
      );
      // Count ignored tasks
      const ignoredTasks = mentionTasks.filter(
        (task) => task.code === taskTypes.REPLY_MENTION_IGNORED
      );
      console.log(`Processed tasks (not ignored): ${processedTasks.length}`);
      console.log(`Ignored tasks: ${ignoredTasks.length}`);
      // Verify that we have tasks
      assert.ok(
        mentionTasks.length >= 1,
        `Expected at least 1 task, but got ${mentionTasks.length}`
      );
      // Verify that exactly one task was processed (not ignored)
      assert.strictEqual(
        processedTasks.length,
        1,
        `Expected exactly 1 processed task, but got ${processedTasks.length}. ` +
          `This means ${processedTasks.length} replies would have been sent!`
      );
      // Verify that the remaining tasks were ignored
      assert.ok(
        ignoredTasks.length >= 1,
        `Expected at least 1 ignored task, but got ${ignoredTasks.length}. ` +
          `All concurrent requests should have been rejected except one.`
      );
      // Verify the processed task has finished
      const processedTask = processedTasks[0];
      assert.ok(
        processedTask.finishedAt !== null,
        'The processed task should have a finishedAt timestamp'
      );
      // Verify ignored tasks are marked as finished immediately
      ignoredTasks.forEach((task, index) => {
        assert.ok(
          task.finishedAt !== null,
          `Ignored task #${index + 1} should have a finishedAt timestamp`
        );
        assert.ok(
          task.code === taskTypes.REPLY_MENTION_IGNORED,
          `Ignored task #${index + 1} should have code set to REPLY_MENTION_IGNORED`
        );
      });
      console.log('Concurrency test PASSED!');
      console.log('Only 1 reply was processed, preventing duplicate messages.');
    });
  });
});
