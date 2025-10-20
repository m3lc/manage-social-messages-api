// @ts-check

import { processPromises } from '#@services/utils/process-promises.js';
import { createLogger } from '#@services/utils/logger/index.js';
import { mentionStates, mentionTypes, taskTypes } from '#@/enums/index.js';
import { AuditDataService } from '#@services/data/audit-data-service.js';
import { SocialMediaService } from '#@/services/social-media/social-media-service.js';
import { db as dbInstance } from '#@models/index.js';

const logger = createLogger(import.meta.url);

export const SOCIAL_MEDIA_API_PROMISES_LIMIT = 10;
export const SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL = '5 minutes';
export const SOCIAL_MEDIA_API_TASK_FETCH_MESSAGES_INTERVAL = '10 minutes';
export const SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL = '10 minutes';

const baseConfig = {
  [mentionTypes.MESSAGE]: {
    mentionType: mentionTypes.MESSAGE,
    fetchType: taskTypes.FETCH_MESSAGES,
    fetchInterval: SOCIAL_MEDIA_API_TASK_FETCH_MESSAGES_INTERVAL,
    replyType: taskTypes.REPLY_MENTION,
    replyInterval: SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL,
  },
  [mentionTypes.COMMENT]: {
    mentionType: mentionTypes.COMMENT,
    fetchType: taskTypes.FETCH_COMMENTS,
    fetchInterval: SOCIAL_MEDIA_API_TASK_FETCH_COMMENTS_INTERVAL,
    replyType: taskTypes.REPLY_MENTION,
    replyInterval: SOCIAL_MEDIA_API_TASK_REPLY_INTERVAL,
  },
};

export class BaseMentionAdapter {
  /**
   * @param {Object} [options]
   * @param {import('#@models/index.js').db} [options.db]
   * @param {SocialMediaService} [options.socialMediaService]
   * @param {AuditDataService} [options.auditDataService]
   */
  constructor({ db, socialMediaService, auditDataService } = {}) {
    this.db = db || dbInstance;
    this.socialMediaService = socialMediaService || SocialMediaService.getInstance();
    this.auditDataService = auditDataService || AuditDataService.getInstance();
  }

  /**
   * Returns configuration object for the adapter.
   * Must be implemented by subclasses.
   * @returns {{ mentionType: string }}
   */
  getConfig() {
    throw new Error('getConfig() must be implemented by subclass');
  }

  /**
   * Processes a fetch task by retrieving entities from the social media platform and creating mentions.
   * Must be implemented by subclasses.
   * @param {Object} params
   * @param {Object} params.task - Task object containing fetch information
   * @param {number} params.task.id - Task id
   * @param {string} params.task.code - Task code
   * @param {Object} params.task.data - Task data
   * @param {string} [params.task.data.reqUser] - JSON string of authenticated user object {id, email}
   * @returns {Promise<void>}
   */
  async processFetchTask({ task }) {
    throw new Error('processFetchTask() must be implemented');
  }

  /**
   * Processes a reply response from the social media API and transforms it into a mention object.
   * Must be implemented by subclasses.
   * @param {Object} params
   * @param {Object} params.replyResponse - Response data from the social media API reply
   * @param {Object} params.mention - Original mention object that was replied to
   * @param {string} params.mention.id - Mention ID
   * @param {string} params.mention.platform - Social media platform
   * @param {string} params.mention.socialMediaAPIPostRef - Reference to the social media post
   * @returns {Omit<import('#@models/mention.js').MentionObject, 'id'|'createdAt'|'updatedAt'|'type'>} Transformed mention object for the reply (without auto-generated fields)
   */
  processReplyResponseToMention({ replyResponse, mention }) {
    throw new Error('processReplyResponseToMention() must be implemented');
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
    const config = baseConfig[this.getConfig().mentionType];
    const task = await this.db.Task.create({
      code: config.fetchType,
      startedAt: new Date(),
      createdBy: reqUser.email,
      data: {
        reqUser: reqUser ? JSON.stringify(reqUser) : undefined,
      },
    });

    await this.processFetchTask({ task });
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
  async processReplyTask({ task }) {
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

      await this.db.transaction(async (transaction) => {
        const result = await this.socialMediaService.reply({
          mention,
          content: task.data.content,
          reqUser: parsedReqUser,
        });

        if (result.status === 'success') {
          // create a mention attached to the original mention
          await this.db.Mention.create(
            {
              ...this.processReplyResponseToMention({ replyResponse: result, mention }),
              type: mentionTypes.REPLY,
              data: {
                socialMediaPayload: result,
              },
              mentionId: mention.id,
            },
            { transaction }
          );

          // mark the original mention as replied
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
   * Initialization logic for the adapter.
   * @returns {void}
   */
  init() {
    if (this.initialized) {
      logger.warn('Adapter already initialized');
      return;
    }
    this.initialized = true;

    // eventual consistency
    const config = baseConfig[this.getConfig().mentionType];
    this._processAllTasks({
      type: config.replyType,
      interval: config.replyInterval,
      fnProcessTask: this.processReplyTask.bind(this),
    }).catch((error) => {
      logger.error('Error processing reply tasks', error);
    });

    this._processAllTasks({
      type: config.fetchType,
      interval: config.fetchInterval,
      fnProcessTask: this.processFetchTask.bind(this),
    }).catch((error) => {
      logger.error('Error processing fetch messages tasks', error);
    });
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

      await this.db.transaction(async (transaction) => {
        task = await this.db.Task.create(
          {
            code: taskTypes.REPLY_MENTION,
            startedAt: now,
            createdBy: reqUser.email,
            data: {
              mentionId,
              content,
              reqUser: JSON.stringify(reqUser),
            },
          },
          { transaction }
        );
        await this.auditDataService.audit({
          event: mentionStates.REPLY_ATTEMPT,
          data: {
            mentionId: mention.id,
            taskId: task.id,
          },
          createdBy: reqUser.email,
          transaction,
        });

        await mention.update(
          {
            state: mentionStates.REPLY_ATTEMPT,
          },
          { transaction }
        );
      });

      await this.processReplyTask({ task });
    } catch (error) {
      logger.error('Error creating reply task', error);
      // however a task with type REPLY and data->'isIgnored' set to true will be added
      // to keep track of the attempts of replying to a mention that has already been replied to
      await this.db.Task.create({
        code: taskTypes.REPLY_MENTION_IGNORED,
        startedAt: now,
        finishedAt: now,
        createdBy: reqUser.email,
        data: {
          mentionId,
          content,
          reqUser: JSON.stringify(reqUser),
          error,
        },
      });

      throw error;
    }
  }

  /**
   * Indicates whether the process is currently running.
   * @returns {Promise<{ isSyncing: boolean }>}
   */
  async isSyncingFetch() {
    const config = baseConfig[this.getConfig().mentionType];
    const existingTasks = await this.db.query(
      this.getRecentTasksQuery({
        selectClause: 'case when "finishedAt" is null then true else false end as "isSyncing"',
      }),
      {
        type: this.db.QueryTypes.SELECT,
        replacements: {
          type: config.fetchType,
          interval: config.fetchInterval,
        },
      }
    );

    const isSyncing = existingTasks.some((task) => task.isSyncing);

    return { isSyncing };
  }

  /**
   * Generates a SQL query to fetch recent fetch tasks. It expects replacements to be provided
   * for :type and :interval.
   * @param {Object} params
   * @param {string} params.selectClause - SQL SELECT clause
   * @param {boolean} [params.includeUnfinished] - Whether to include unfinished tasks
   * @param {string} [params.mentionType] - Mention type to filter by
   * @returns {string} SQL query string
   */
  getRecentTasksQuery({ selectClause, includeUnfinished = false, mentionType }) {
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
            ${
              mentionType
                ? `
                  and exists (
                    select 1
                    from mentions
                    where mentions.id = cast(tasks.data->>'mentionId' as bigint)
                    and mentions.type = :mentionType
                  )
                `
                : ''
            }
          `;
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
    const mentionType = this.getConfig().mentionType;
    const tasks = await this.db.query(
      this.getRecentTasksQuery({
        selectClause: '*',
        includeUnfinished: true,
        mentionType,
      }),
      { model: this.db.Task, replacements: { type, interval, mentionType } }
    );

    await processPromises({
      promiseFunc: async ({ entity: task }) => await fnProcessTask({ task }),
      entities: tasks,
      promisesLimit: SOCIAL_MEDIA_API_PROMISES_LIMIT,
    });
  }

  /**
   * Creates mentions from social media messages
   * @param {Object} params
   * @param {Array<Object>} params.mentions - Array of mention objects
   * @returns {Promise<void>}
   */
  async _createMentions({ mentions }) {
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
          values ${mentions
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
      `
    );
  }
}
