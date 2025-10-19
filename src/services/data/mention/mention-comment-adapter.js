// @ts-check

import { db as dbInstance } from '#@models/index.js';
import { SocialMediaService } from '#@services/social-media/social-media-service.js';
import { processPromises } from '#@services/utils/process-promises.js';
import { mentionTypes, taskTypes } from '#@enums/index.js';
import { createLogger } from '#@services/utils/logger/index.js';
import { AuditDataService } from '#@services/data/audit-data-service.js';
import mentionStates from '#@enums/mention-states.js';
import { BaseMentionAdapter } from '#@services/data/mention/base-mention-adapter.js';

const SOCIAL_MEDIA_API_PROMISES_LIMIT = 10;
const SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL = '10 minutes';
const SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL = '5 minutes';

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
   * @param {Object} [options]
   * @param {import('#@models/index.js')} [options.db]
   * @param {SocialMediaService} [options.socialMediaService]
   * @param {AuditDataService} [options.auditDataService]
   */
  constructor({ db, socialMediaService, auditDataService } = {}) {
    super();
    this.db = db || dbInstance;
    this.socialMediaService = socialMediaService || SocialMediaService.getInstance();
    this.auditDataService = auditDataService || AuditDataService.getInstance();
  }

  init() {
    if (this.initialized) {
      logger.warn('Adapter already initialized');
      return;
    }
    this.initialized = true;

    // eventual consistency
    this._processAllTasks({
      type: taskTypes.REPLY_MENTION,
      interval: SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL,
      fnProcessTask: this._processReplyTask.bind(this),
    }).catch((error) => {
      logger.error('Error processing reply tasks', error);
    });

    this._processAllTasks({
      type: taskTypes.FETCH_COMMENTS,
      interval: SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL,
      fnProcessTask: this._processFetchCommentsTask.bind(this),
    }).catch((error) => {
      logger.error('Error processing fetch comments tasks', error);
    });
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

      await this._processFetchCommentsTask({ task });
    }
  }

  /**
   * Indicates whether the process is currently running.
   * @returns {Promise<{ isSyncing: boolean }>}
   */
  async isSyncing() {
    const existingTasks = await this.db.query(
      this._getRecentTasksQuery({
        selectClause: 'case when "finishedAt" is null then true else false end as "isSyncing"',
      }),
      {
        type: this.db.QueryTypes.SELECT,
        replacements: {
          type: taskTypes.FETCH_COMMENTS,
          interval: SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL,
        },
      }
    );

    const isSyncing = existingTasks.some((task) => task.isSyncing);

    return { isSyncing };
  }

  async reply({ mention, content, reqUser }) {
    // create a task of type REPLY having data->>'mentionId' set to the mention id
    // a unique partial index on task type and data->>'mentionId'
    // will ensure that only one reply task is created for a mention
    const now = new Date();
    const mentionId = mention.id;
    let task;
    try {
      // clear old reply tasks
      await this.db.query(
        `
        delete from tasks
        where "code" = 'REPLY_MENTION'
        and "data"->>'mentionId' = :mentionId
        and "finishedAt" is null
        and "startedAt" < NOW() - INTERVAL :interval
      `,
        {
          replacements: {
            mentionId,
            interval: SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL,
          },
          type: this.db.QueryTypes.DELETE,
        }
      );
      task = await this.db.Task.create({
        code: taskTypes.REPLY_MENTION,
        startedAt: now,
        createdBy: reqUser.email,
        data: {
          mentionId,
          content,
          reqUser: JSON.stringify(reqUser),
        },
      });
    } catch (error) {
      logger.error('Error creating reply task', error);
      // however a task with type REPLY and data->'isIgnored' set to true will be added
      // to keep track of the attempts of replying to a mention that has already been replied to
      task = await this.db.Task.create({
        code: taskTypes.REPLY_MENTION_IGNORED,
        startedAt: now,
        finishedAt: now,
        createdBy: reqUser.email,
        data: {
          mentionId,
          content,
          reqUser: JSON.stringify(reqUser),
        },
      });
    }

    await this._processReplyTask({ task });
  }

  /**
   * Processes all tasks for eventual consistency
   * @param {Object} params
   * @param {string} params.type - Task type to process
   * @param {string} params.interval - Time interval for filtering tasks
   * @param {Function} params.fnProcessTask - Function to process each task
   * @returns {Promise<void>}
   */
  async _processAllTasks({ type, interval, fnProcessTask }) {
    const tasks = await this.db.query(
      this._getRecentTasksQuery({
        selectClause: '*',
        includeUnfinished: true,
      }),
      { model: this.db.Task, replacements: { type, interval } }
    );

    await processPromises({
      promiseFunc: async ({ entity: task }) => await fnProcessTask({ task }),
      entities: tasks,
      promisesLimit: SOCIAL_MEDIA_API_PROMISES_LIMIT,
    });
  }

  /**
   * Finds post IDs that have been fetched recently within the configured interval
   * Queries tasks of type FETCH_COMMENTS created within SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL
   * @returns {Promise<Array<string>>} Array of post IDs from recent fetch tasks
   */
  async _findFreshlyFetchedPostIds() {
    const existingTasks = await this.db.query(
      this._getRecentTasksQuery({
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
   * Generates a SQL query to fetch recent fetch tasks. It expects replacements to be provided
   * for :type and :interval.
   * @param {Object} params
   * @param {string} params.selectClause - SQL SELECT clause
   * @param {boolean} [params.includeUnfinished] - Whether to include unfinished tasks
   * @returns {string} SQL query string
   */
  _getRecentTasksQuery({ selectClause, includeUnfinished = false }) {
    return `
        select ${selectClause}
        from tasks
        where code = :type
        and "createdAt" >= NOW() - INTERVAL :interval
        ${
          includeUnfinished
            ? `
              and "startedAt" >= NOW() - INTERVAL :interval
              and "finishedAt" is null
            `
            : ''
        }
      `;
  }

  /**
   * Processes a reply task by replying to a mention if not ignored
   * @param {Object} params
   * @param {Object} params.task - Task object containing reply information
   * @param {number} params.task.id - Task id
   * @param {string} params.task.code - Task type (should be REPLY_MENTION)
   * @param {Object} params.task.data - Task data
   * @param {number} params.task.data.mentionId - ID of mention to reply to
   * @param {string} params.task.data.content - Reply content
   * @param {string} params.task.data.reqUser - JSON string of authenticated user object {id, email}
   * @param {boolean} [params.task.data.isIgnored] - Whether task should be ignored
   * @returns {Promise<void>}
   */
  async _processReplyTask({ task }) {
    // if the task is not ignored, then reply to the mention using SocialMediaService
    // and update the task with the result
    if (!task.data.isIgnored) {
      const parsedReqUser = JSON.parse(task.data.reqUser);

      // find the mention
      const mention = await this.db.Mention.findByPk(task.data.mentionId);

      if (!mention) {
        logger.warn(`Mention ${task.data.mentionId} not found for task ${task.id}`);
        return;
      }

      await this.auditDataService.audit({
        event: mentionStates.REPLY_ATTEMPT,
        data: {
          mentionId: mention.id,
          taskId: task.id,
        },
        createdBy: String(parsedReqUser.id),
      });

      await mention.update({
        state: mentionStates.REPLY_ATTEMPT,
      });

      await this.db.transaction(async (transaction) => {
        const result = await this.socialMediaService.replyComment({
          mention,
          content: task.data.content,
          reqUser: parsedReqUser,
          transaction,
        });

        if (result.status === 'success') {
          const replyData = result[mention.platform];
          // create a mention attached to the original mention
          await this.db.Mention.create(
            {
              content: replyData.comment,
              socialMediaPlatformRef: replyData.commentId,
              socialMediaAPIPostRef: mention.socialMediaAPIPostRef,
              platform: mention.platform,
              type: mentionTypes.REPLY,
              data: {
                socialMediaPayload: result,
              },
              mentionId: mention.id,
            },
            { transaction }
          );

          await mention.update(
            {
              state: mentionStates.REPLIED,
            },
            { transaction }
          );
        } else {
          await mention.update(
            {
              state: mentionStates.PROVIDER_ERROR,
            },
            { transaction }
          );
        }

        // update the task
        // set finishedAt if the result.status is 'success'
        await this.db.Task.update(
          {
            finishedAt: result.status === 'success' ? new Date() : null,
            data: {
              ...task.data,
              result,
            },
          },
          {
            where: {
              id: task.id,
            },
            transaction,
          }
        );
      });
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
  async _processFetchCommentsTask({ task }) {
    // fetch all comments and messages for each post
    const parsedReqUser = task.data.reqUser ? JSON.parse(task.data.reqUser) : undefined;
    const comments = await processPromises({
      promiseFunc: async ({ entity: post }) => {
        const comments = await this.socialMediaService.findAllComments(post, parsedReqUser);

        if (comments.length) {
          await this._createMentionsFromComments({ comments, taskId: task.id });
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

  /**
   * Creates mentions from social media comments
   * @param {Object} params
   * @param {Array<Object>} params.comments - Array of comment objects from social media
   * @param {number} params.taskId - Task ID
   * @param {Object} [params.transaction] - Database transaction object
   * @returns {Promise<void>}
   */
  async _createMentionsFromComments({ comments, taskId, transaction }) {
    const newMentions = this._transformCommentsToMentions(comments, taskId);

    // there is a unique constraint on socialMediaPlatformRef
    // so if the mention already exists it will be ignored
    await this.db.query(
      `
      with mentions_to_insert (
        content,
        "socialMediaPlatformRef",
        "socialMediaAPIPostRef",
        platform,
        type,
        "createdAt",
        "updatedAt",
        data
      ) as (
        values ${newMentions
          .map(
            (mention) => `
              (
                ${this.db.escape(mention.content || '')},
                ${this.db.escape(mention.socialMediaPlatformRef || '')},
                ${this.db.escape(mention.socialMediaAPIPostRef || '')},
                ${this.db.escape(mention.platform || '')},
                ${this.db.escape(mention.type || '')},
                NOW(),
                NOW(),
                ${this.db.escape(JSON.stringify(mention.data) || '{}')}::jsonb
              )
            `
          )
          .join(',')}
      )
      insert into mentions (content, "socialMediaPlatformRef", "socialMediaAPIPostRef", platform, type, "createdAt", "updatedAt", data)
      select * from mentions_to_insert
      where not exists (
        select 1 from mentions where "socialMediaPlatformRef" = mentions_to_insert."socialMediaPlatformRef"
      )
      on conflict do nothing;
    `,
      {
        transaction,
      }
    );
  }
}
