// @ts-check

import {http as httpInstance} from '../http/index.js';
import { SOCIAL_MEDIA_API_KEY, SOCIAL_MEDIA_API_URL, SOCIAL_MEDIA_API_HISTORY_LAST_DAYS } from '../../config.js';

export class SocialMediaService {
  /** @type {SocialMediaService | null} */
  static instance = null;

  /**
   * @param {Object} [options]
   * @param {import('../http/index.js')} [options.http]
   */
  static getInstance({http} = {}) {
    if (!SocialMediaService.instance) {
      SocialMediaService.instance = new SocialMediaService({http});
    }
    return SocialMediaService.instance;
  }

  /**
   * @param {Object} [options]
   * @param {import('../http/index.js')} [options.http]
   */
  constructor({http} = {}) {
    this.http = http || httpInstance;
  }


  async findAllPosts() {
    const response = await this.httpRequest({url: `/history?lastDays=${SOCIAL_MEDIA_API_HISTORY_LAST_DAYS}`});
    return response.data;
  }

  async findAllComments(postId) {
    const response = await this.httpRequest({url: `/comments/${postId}`});
    return response.data;
  }

  async replyComment() {

  }

  async replyMessage() {

  }

  async registerMessagesWebhook() {

  }

  /**
   * @param {Object} params
   * @param {string} params.url
   * @param {string} [params.method]
   * @param {Object} [params.data]
   * @param {Object} [params.data.headers]
   */
  async httpRequest({url, method = 'get', data = {}}) {
    return await this.http[method](`${SOCIAL_MEDIA_API_URL}${url}`, {
      ...data,
      headers: {
        ...(data.headers || {}),
        Authorization: `Bearer ${SOCIAL_MEDIA_API_KEY}`
      }
    });
  }

}