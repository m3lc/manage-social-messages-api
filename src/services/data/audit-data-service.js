import { db as dbInstance } from '#@models/index.js';

export class AuditDataService {
  /** @type {AuditDataService | null} */
  static instance = null;

  /**
   * @param {Object} [options]
   * @param {*} [options.db]
   */
  static getInstance(options) {
    if (!AuditDataService.instance) {
      AuditDataService.instance = new AuditDataService(options);
    }
    return AuditDataService.instance;
  }

  /**
   * @param {Object} [options]
   * @param {*} [options.db]
   */
  constructor(options) {
    const { db } = options || {};
    this.db = db || dbInstance;
  }

  /**
   * Create an audit log entry
   * @param {Object} params
   * @param {string} params.event - Event name/type
   * @param {Object} [params.data] - Additional data to store
   * @param {string} [params.createdBy] - User ID who created the audit
   * @param {Object} [params.transaction] - Database transaction object
   * @returns {Promise<Object>} Created audit record
   */
  async audit({ event, data, createdBy, transaction }) {
    return this.db.Audit.create({ event, data, createdBy }, { transaction });
  }
}
