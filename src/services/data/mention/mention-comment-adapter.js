// @ts-check

import { SocialMediaService } from '#@services/social-media/social-media-service.js';
import { processPromises } from '#@services/utils/process-promises.js';
import { mentionTypes, taskTypes } from '#@enums/index.js';
import { createLogger } from '#@services/utils/logger/index.js';
import { AuditDataService } from '#@services/data/audit-data-service.js';
import {
  BaseMentionAdapter,
  SOCIAL_MEDIA_API_PROMISES_LIMIT,
  SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL,
} from '#@services/data/mention/base-mention-adapter.js';

const SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL = '10 minutes';

const logger = createLogger(import.meta.url);

export class MentionCommentAdapter extends BaseMentionAdapter {
  /** @type {MentionCommentAdapter | null} */
  static instance = null;

  /**
   * @param {Object} [options]
   * @param {import('#@models/index.js')} [options.db]
   * @param {SocialMediaService} [options.socialMediaService]
   * @param {AuditDataService} [options.auditDataService]
   */
  static getInstance({ db, socialMediaService, auditDataService } = {}) {
    if (!MentionCommentAdapter.instance) {
      MentionCommentAdapter.instance = new MentionCommentAdapter({
        db,
        socialMediaService,
        auditDataService,
      });
    }
    return MentionCommentAdapter.instance;
  }

  /**
   * Returns configuration object for the comment adapter.
   * @returns {{ mentionType: string }}
   */
  getConfig() {
    return {
      mentionType: mentionTypes.COMMENT,
    };
  }

  /**
   * Fetches comments and creates mentions for them in the database
   * @param {Object} [reqUser] - Authenticated user object
   * @param {number} [reqUser.id] - User ID
   * @param {string} [reqUser.email] - User email
   * @returns {Promise<void>}
   */
  async fetchAndSyncMentions(reqUser) {
    // fetch all posts for the configured period according to SOCIAL_MEDIA_API_HISTORY_LAST_DAYS
    const posts = await this.socialMediaService.findAllPosts(reqUser);

    // find all posts that have been fetched recently within the configured interval
    const existingPostIds = await this._findFreshlyFetchedPostIds();

    // filter out posts that have been fetched recently
    const postsToFetch = posts.filter(
      (post, index, self) =>
        !existingPostIds.includes(post.id) && self.findIndex((p) => p.id === post.id) === index
    );

    if (postsToFetch.length > 0) {
      const task = await this.db.Task.create({
        code: taskTypes.FETCH_COMMENTS,
        startedAt: new Date(),
        createdBy: reqUser.email,
        data: {
          posts: postsToFetch,
          reqUser: reqUser ? JSON.stringify(reqUser) : undefined,
        },
      });

      await this.processFetchTask({ task });
    }
  }

  /**
   * Processes a fetch comments task by retrieving comments for posts and creating mentions
   * @param {Object} params
   * @param {Object} params.task - Task object containing fetch information
   * @param {number} params.task.id - Task id
   * @param {string} params.task.code - Task code (should be FETCH_COMMENTS)
   * @param {Object} params.task.data - Task data
   * @param {Array<Object>} params.task.data.posts - Array of posts to fetch comments for
   * @param {string} [params.task.data.reqUser] - JSON string of authenticated user object {id, email}
   * @returns {Promise<void>}
   */
  async processFetchTask({ task }) {
    // fetch all comments for each post
    const parsedReqUser = task.data.reqUser ? JSON.parse(task.data.reqUser) : undefined;
    const comments = await processPromises({
      promiseFunc: async ({ entity: post }) => {
        const comments = await this.socialMediaService.findAllComments(post, parsedReqUser);

        if (comments.length) {
          const mentions = this._transformCommentsToMentions(comments, task.id);

          if (mentions.length) {
            await this._createMentions({ mentions });
          }
        }

        return comments;
      },
      entities: task.data.posts,
      promisesLimit: SOCIAL_MEDIA_API_PROMISES_LIMIT,
    });

    // update the task with details and timestamps
    await this.db.Task.update(
      {
        finishedAt: new Date(),
        data: {
          ...task.data,
          posts: task.data.posts.map((post) => post.id),
          comments: comments.flat(),
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
    const replyData = replyResponse[mention.platform];

    /** @type {Omit<import('#@models/mention.js').MentionObject, 'id'|'createdAt'|'updatedAt'|'type'>} */
    return {
      content: replyData.comment,
      socialMediaPlatformRef: replyData.commentId,
      socialMediaAPIPostRef: mention.socialMediaAPIPostRef,
      platform: mention.platform,
      data: {
        socialMediaPayload: replyResponse,
      },
      mentionId: mention.id,
    };
  }

  /**
   * Finds post IDs that have been fetched recently within the configured interval
   * Queries tasks of type FETCH_COMMENTS created within SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL
   * @returns {Promise<Array<string>>} Array of post IDs from recent fetch tasks
   */
  async _findFreshlyFetchedPostIds() {
    const existingTasks = await this.db.query(
      this.getRecentTasksQuery({
        selectClause: `data->>'posts' as posts`,
      }),
      {
        type: this.db.QueryTypes.SELECT,
        replacements: {
          type: taskTypes.FETCH_COMMENTS,
          interval: SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL,
        },
      }
    );

    const existingPostIds = [
      ...new Set(existingTasks.map((task) => JSON.parse(task.posts)).flat()),
    ];

    return existingPostIds;
  }

  /**
   * Transforms social media comments into mention objects
   * @param {Array<Object>} comments - Array of comment objects from social media
   * @returns {Array} Array of transformed mention objects
   */
  _transformCommentsToMentions(comments, taskId) {
    const mentions = [];

    comments.forEach((c) => {
      mentions.push({
        socialMediaPlatformRef: c.commentId,
        socialMediaAPIPostRef: c.apiPostId,
        content: c.comment,
        platform: c.platform,
        type: mentionTypes.COMMENT,
        data: {
          socialMediaPayload: c,
          taskId,
        },
      });
    });

    return mentions;
  }
}
