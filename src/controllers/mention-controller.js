// @ts-check

import { MentionDataService } from '#@services/data/mention-data-service.js';

export class MentionController {
  constructor(service) {
    this.service = service || MentionDataService.getInstance();
  }

  /**
   * Get all mentions
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async findAll(req, res) {
    const result = await this.service.findAll({ reqUser: req.user });
    res.json(result);
  }

  /**
   * Update a mention
   * @param {Object} req - Express request
   * @param {Object} req.params - Route parameters
   * @param {string} req.params.id - Mention ID
   * @param {Object} req.body - Request body
   * @param {Object} req.user - Authenticated user from auth middleware
   * @param {number} req.user.id - User ID
   * @param {string} req.user.email - User email
   * @param {Object} res - Express response
   */
  async update(req, res) {
    const result = await this.service.update(req.params.id, req.body, req.user);
    res.json(result);
  }

  /**
   * Reply to a mention
   * @param {Object} req - Express request
   * @param {Object} req.params - Route parameters
   * @param {string} req.params.id - Mention ID
   * @param {Object} req.body - Request body
   * @param {string} req.body.content - Reply content
   * @param {Object} req.user - Authenticated user from auth middleware
   * @param {number} req.user.id - User ID
   * @param {string} req.user.email - User email
   * @param {Object} res - Express response
   */
  async reply(req, res) {
    const result = await this.service.reply({
      mentionId: req.params.id,
      content: req.body.content,
      reqUser: req.user,
    });
    res.json(result);
  }
}
