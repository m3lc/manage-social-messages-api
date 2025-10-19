// @ts-check

import { db as dbInstance } from '#@models/index.js';
import { mentionStates, mentionTypes } from '#@enums/index.js';
import { AuditDataService } from '#@services/data/audit-data-service.js';
import { MentionCommentAdapter } from '#@services/data/mention/mention-comment-adapter.js';
import { createLogger } from '#@services/utils/logger/index.js';
import { sleep } from '#@services/utils/sleep.js';
import { SocialMediaService } from '#@/services/social-media/social-media-service.js';

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

    this.adapters = {};
    this._registerAdapters();
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
    // Fetch from ALL adapters in parallel
    const fetchPromises = Object.values(this.adapters).map((adapter) =>
      adapter
        .fetchAndSyncMentions(reqUser)
        .then(() => adapter.isSyncing())
        .catch((error) => {
          logger.error(`Error in adapter ${adapter.constructor.name}`, error);
          return { error: error.message };
        })
    );

    const meta = await Promise.race([
      Promise.all(fetchPromises).then((results) => ({
        isSyncing: results.some((r) => r.isSyncing),
        errors: results.filter((r) => r.error),
      })),
      sleep(waitMs).then(() => ({ isSyncing: true })),
    ]);

    const mentions = await this.db.Mention.findAll({
      order: [['createdAt', 'DESC']],
    });

    return { result: mentions, meta };
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
    const mention = await this.db.Mention.findByPk(parseInt(String(mentionId), 10));
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
        createdBy: reqUser.email,
      });
    } else if (mention.userId && data.userId === null) {
      data.state = null;
    }

    await mention.update(data);

    return mention;
  }

  /**
   * Reply to mention according to the adapter that corresponds to the mention type.
   * @param {Object} params
   * @param {number} params.mentionId - Mention ID
   * @param {string} params.content - Reply content
   * @param {Object} params.reqUser - Authenticated user object
   * @param {number} params.reqUser.id - User ID
   * @param {string} params.reqUser.email - User email
   * @returns {Promise<void>}
   */
  async reply({ mentionId, content, reqUser }) {
    // Validate inputs
    if (!mentionId || typeof parseInt(String(mentionId), 10) !== 'number') {
      throw new Error('Invalid mentionId');
    }
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid content');
    }
    if (content.length > 10000) {
      throw new Error('Content exceeds maximum length');
    }
    if (!reqUser?.id || !reqUser?.email) {
      throw new Error('Invalid user');
    }

    const mention = await this.db.Mention.findByPk(parseInt(String(mentionId), 10));

    if (!mention) {
      throw new Error('Mention not found');
    }

    const adapter = this.adapters[mention.type];

    if (!adapter) {
      throw new Error(`No adapter registered for mention type: ${mention.type}`);
    }

    await adapter.reply({ mention, content, reqUser });
  }

  _registerAdapters() {
    // Register all adapters
    this.adapters = {
      [mentionTypes.COMMENT]: MentionCommentAdapter.getInstance({
        db: this.db,
        socialMediaService: this.socialMediaService,
        auditDataService: this.auditDataService,
      }),
    };

    // Initialize adapters
    Object.values(this.adapters).forEach((adapter) => adapter.init());
  }
}
