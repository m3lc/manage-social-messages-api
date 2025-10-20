// @ts-check

import { SocialMediaService } from '#@services/social-media/social-media-service.js';
import { mentionTypes, taskTypes } from '#@enums/index.js';
import { createLogger } from '#@services/utils/logger/index.js';
import { AuditDataService } from '#@services/data/audit-data-service.js';
import {
  BaseMentionAdapter,
  SOCIAL_MEDIA_API_PROMISES_LIMIT,
  SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL,
} from '#@services/data/mention/base-mention-adapter.js';

const SOCIAL_MEDIA_API_TASK_FETCH_MESSAGES_INTERVAL = '10 minutes';

const logger = createLogger(import.meta.url);

export class MentionMessageAdapter extends BaseMentionAdapter {
  /** @type {MentionMessageAdapter | null} */
  static instance = null;

  /**
   * @param {Object} [options]
   * @param {import('#@models/index.js')} [options.db]
   * @param {SocialMediaService} [options.socialMediaService]
   * @param {AuditDataService} [options.auditDataService]
   */
  static getInstance({ db, socialMediaService, auditDataService } = {}) {
    if (!MentionMessageAdapter.instance) {
      MentionMessageAdapter.instance = new MentionMessageAdapter({
        db,
        socialMediaService,
        auditDataService,
      });
    }
    return MentionMessageAdapter.instance;
  }

  /**
   * Returns configuration object for the message adapter.
   * @returns {{ mentionType: string }}
   */
  getConfig() {
    return {
      mentionType: mentionTypes.MESSAGE,
    };
  }

  /**
   * Fetches and syncs mentions from the social media platform entities.
   * This function could be used to create a "task" entity and call "processFetchTask".
   * @param {Object} [reqUser] - Authenticated user object
   * @param {number} [reqUser.id] - User ID
   * @param {string} [reqUser.email] - User email
   * @returns {Promise<void>}
   */
  async fetchAndSyncMentions(reqUser) {
    // find all posts that have been fetched recently within the configured interval
    const existingMessageTasksCountResult = await this.db.query(
      this.getRecentTasksQuery({
        selectClause: `count(1)::int as count`,
      }),
      {
        type: this.db.QueryTypes.SELECT,
        replacements: {
          type: taskTypes.FETCH_MESSAGES,
          interval: SOCIAL_MEDIA_API_TASK_FETCH_MESSAGES_INTERVAL,
        },
      }
    );

    if (existingMessageTasksCountResult?.[0]?.count) {
      logger.warn('Message fetching task already exists');
      return;
    }

    const task = await this.db.Task.create({
      code: taskTypes.FETCH_MESSAGES,
      startedAt: new Date(),
      createdBy: reqUser.email,
      data: {
        reqUser: reqUser ? JSON.stringify(reqUser) : undefined,
      },
    });

    await this.processFetchTask({ task });
  }

  /**
   * Processes a fetch messages task by retrieving messages for posts and creating mentions
   * @param {Object} params
   * @param {Object} params.task - Task object containing fetch information
   * @param {number} params.task.id - Task id
   * @param {string} params.task.code - Task code (should be FETCH_MESSAGES)
   * @param {Object} params.task.data - Task data
   * @param {string} [params.task.data.reqUser] - JSON string of authenticated user object {id, email}
   * @returns {Promise<void>}
   */
  async processFetchTask({ task }) {
    // fetch all messages
    const parsedReqUser = task.data.reqUser ? JSON.parse(task.data.reqUser) : undefined;
    const messages = await this.socialMediaService.findAllMessages(parsedReqUser);

    const mentions = this._transformMessagesToMentions(messages, task.id);

    if (mentions.length) {
      await this._createMentions({ mentions });
    }

    // update the task with details and timestamps
    await this.db.Task.update(
      {
        finishedAt: new Date(),
        data: {
          ...task.data,
          messages,
        },
      },
      {
        where: {
          id: task.id,
        },
      }
    );
  }

  processReplyResponseToMention({ replyResponse, mention }) {
    const replyData = replyResponse;

    /** @type {Omit<import('#@models/mention.js').MentionObject, 'id'|'createdAt'|'updatedAt'>} */
    const result = {
      content: replyData.message,
      socialMediaPlatformRef: replyResponse.messageId,
      socialMediaAPIPostRef: mention.socialMediaAPIPostRef,
      platform: mention.platform,
      type: mentionTypes.REPLY,
      data: {
        socialMediaPayload: replyResponse,
      },
      mentionId: mention.id,
    };
    return result;
  }

  /**
   * Transforms social media messages into mention objects
   * @param {Array<Object>} messages - Array of message objects from social media
   * @param {number} taskId - Task ID
   * @returns {Array} Array of transformed mention objects
   */
  _transformMessagesToMentions(messages, taskId) {
    const mentions = [];

    messages.forEach((m) => {
      mentions.push({
        socialMediaPlatformRef: m.id,
        socialMediaAPIPostRef: m.conversationId,
        content: m.message,
        platform: m.platform,
        type: mentionTypes.MESSAGE,
        data: {
          socialMediaPayload: m,
          taskId,
        },
      });
    });

    return mentions;
  }
}
