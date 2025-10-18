// @ts-check

import { SocialMediaService } from '#@services/social-media/social-media-service.js';

export class StatusController {
  constructor() {
    this.socialMediaService = SocialMediaService.getInstance();
  }

  findAll(_req, res) {
    res.sendStatus(200);
  }

  /**
   * Get circuit breaker health status for all social media platforms
   * Returns 200 if all circuits are healthy, 503 if any circuit is degraded
   */
  async findHealth(_req, res) {
    try {
      const health = await this.socialMediaService.findHealth();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve circuit breaker health',
        error: error.message,
      });
    }
  }
}
