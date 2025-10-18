// @ts-check

import { db as dbInstance } from '#@models/index.js';
import { SocialMediaService } from '#@services/social-media/social-media-service.js';
import { processPromises } from '#@services/utils/process-promises.js';
import { mentionTypes, taskTypes } from '#@enums/index.js';
import { createLogger } from '#@services/utils/logger/index.js';
import { sleep } from '#@services/utils/sleep.js';
import { AuditDataService } from '#@services/data/audit-data-service.js';
import mentionStates from '#@enums/mention-states.js';

const SOCIAL_MEDIA_API_PROMISES_LIMIT = 10;
const SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL = '10 minutes';
const SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL = '5 minutes';

const logger = createLogger(import.meta.url);

export class MentionDataService {
  /** @type {MentionDataService | null} */
  static instance = null;

  /**
   * @param {Object} [options]
   * @param {import('#@models/index.js')} [options.db]
   * @param {SocialMediaService} [options.socialMediaService]
   * @param {AuditDataService} [options.auditDataService]
   */
  static getInstance({ db, socialMediaService, auditDataService } = {}) {
    if (!MentionDataService.instance) {
      MentionDataService.instance = new MentionDataService({
        db,
        socialMediaService,
        auditDataService,
      });
      MentionDataService.instance.init();
    }
    return MentionDataService.instance;
  }

  /**
   * @param {Object} [options]
   * @param {import('#@models/index.js')} [options.db]
   * @param {SocialMediaService} [options.socialMediaService]
   * @param {AuditDataService} [options.auditDataService]
   */
  constructor({ db, socialMediaService, auditDataService } = {}) {
    this.db = db || dbInstance;
    this.socialMediaService = socialMediaService || SocialMediaService.getInstance();
    this.auditDataService = auditDataService || AuditDataService.getInstance();
  }

  init() {
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
   * Retrieves all mentions from both comments and messages
   * Fetches posts from the configured history period, then retrieves all associated comments
   * and messages, transforming them into mention objects
   * @param {Object} [options]
   * @param {number} [options.waitMs=2000] - Maximum time to wait for fresh data before returning cached data
   * @param {Object} [options.reqUser] - Authenticated user object
   * @param {number} [options.reqUser.id] - User ID
   * @param {string} [options.reqUser.email] - User email
   * @returns {Promise<Array|Object>} Array of mention objects, or object with data and metadata if includeMetadata is true
   */
  async findAll({ waitMs = 2000, reqUser } = {}) {
    // Start background fetch
    const fetchPromise = this._fetchCommentsAndCreateMentions(reqUser)
      .then(() => this._isSyncing())
      .catch((error) => {
        const message = 'Error fetching comments and creating mentions';
        logger.error(message, error);
        return { error: message };
      });

    // Wait up to waitMs for fresh data, or return cached data if it takes longer
    const meta = await Promise.race([
      fetchPromise,
      sleep(waitMs).then(() => ({ isSyncing: true })),
    ]);

    // Return what's in the database (either fresh or cached)
    const mentions = await this.db.Mention.findAll({ order: [['createdAt', 'DESC']] });

    return {
      result: mentions,
      meta,
    };
  }

  /**
   * Update a mention
   * @param {number} mentionId - Mention ID
   * @param {Object} data - Update data
   * @param {Object} reqUser - Authenticated user object
   * @param {number} reqUser.id - User ID
   * @param {string} reqUser.email - User email
   * @returns {Promise<Object>} Updated mention
   */
  async update(mentionId, data, reqUser) {
    const mention = await this.db.Mention.findByPk(mentionId);
    if (!mention) {
      throw new Error('Mention not found');
    }

    if (data.userId) {
      data.state = mentionStates.ASSIGNMENT;

      await this.auditDataService.audit({
        event: data.state,
        data: {
          mentionId,
          ...data,
        },
        createdBy: String(reqUser.id),
      });
    } else if (mention.userId && data.userId === null) {
      data.state = null;
    }

    await mention.update(data);

    return mention;
  }

  /**
   * Create a reply task for a mention
   * @param {Object} params
   * @param {number} params.mentionId - Mention ID
   * @param {string} params.content - Reply content
   * @param {Object} params.reqUser - Authenticated user object
   * @param {number} params.reqUser.id - User ID
   * @param {string} params.reqUser.email - User email
   * @returns {Promise<void>}
   */
  async reply({ mentionId, content, reqUser }) {
    // create a task of type REPLY having data->>'mentionId' set to the mention id
    // a unique partial index on task type and data->>'mentionId'
    // will ensure that only one reply task is created for a mention
    const now = new Date();
    let task;
    try {
      // clear old reply tasks
      await this.db.query(`
        delete from tasks
        where "code" = 'REPLY_MENTION'
        and "data"->>'mentionId' = '${mentionId}'
        and "finishedAt" is null
        and "startedAt" < NOW() - INTERVAL '${SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL}'
      `);
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

        await mention.update(
          {
            state:
              result.status === 'success'
                ? mentionStates.REPLY_ATTEMPT
                : mentionStates.PROVIDER_ERROR,
          },
          { transaction }
        );

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
        whereClause: `
          "finishedAt" is null
          and "startedAt" >= NOW() - INTERVAL '${interval}'
        `,
        interval,
        type,
      }),
      { model: this.db.Task }
    );

    await processPromises({
      promiseFunc: async ({ entity: task }) => await fnProcessTask({ task }),
      entities: tasks,
      promisesLimit: SOCIAL_MEDIA_API_PROMISES_LIMIT,
    });
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
                '${mention.content || ''}',
                '${mention.socialMediaPlatformRef || ''}',
                '${mention.socialMediaAPIPostRef || ''}',
                '${mention.platform || ''}',
                '${mention.type || ''}',
                NOW(),
                NOW(),
                '${JSON.stringify(mention.data) || '{}'}'::jsonb
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

  /**
   * Fetches comments and creates mentions for them in the database
   * @param {Object} [reqUser] - Authenticated user object
   * @param {number} [reqUser.id] - User ID
   * @param {string} [reqUser.email] - User email
   * @returns {Promise<void>}
   */
  async _fetchCommentsAndCreateMentions(reqUser) {
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
      }
    );

    const existingPostIds = [
      ...new Set(existingTasks.map((task) => JSON.parse(task.posts)).flat()),
    ];

    return existingPostIds;
  }

  async _isSyncing() {
    const existingTasks = await this.db.query(
      this._getRecentTasksQuery({
        selectClause: 'case when "finishedAt" is null then true else false end as "isSyncing"',
      }),
      {
        type: this.db.QueryTypes.SELECT,
      }
    );

    const isSyncing = existingTasks.some((task) => task.isSyncing);

    return { isSyncing };
  }

  /**
   * Generates a SQL query to fetch recent fetch tasks
   * @param {Object} params
   * @param {string} params.selectClause - SQL SELECT clause
   * @param {string} [params.whereClause] - Additional WHERE conditions
   * @param {string} [params.type] - Task type to filter by
   * @param {string} [params.interval] - Time interval for filtering tasks
   * @returns {string} SQL query string
   */
  _getRecentTasksQuery({
    selectClause,
    whereClause,
    type = taskTypes.FETCH_COMMENTS,
    interval = SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL,
  }) {
    return `
      select ${selectClause}
      from tasks
      where code = '${type}'
      and "createdAt" >= NOW() - INTERVAL '${interval}'
      ${whereClause ? 'and ' + whereClause : ''}
    `;
  }
}
