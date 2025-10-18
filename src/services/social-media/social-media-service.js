// @ts-check

import { nanoid } from 'nanoid';
import { http as httpInstance, withLogging, shouldRetryHttpError } from '#@services/http/index.js';
import {
  SOCIAL_MEDIA_API_KEY,
  SOCIAL_MEDIA_API_URL,
  SOCIAL_MEDIA_API_HISTORY_LAST_DAYS,
  SOCIAL_PLATFORMS,
} from '#@/config.js';
import { circuitBreaker, CIRCUIT_STATE } from '#@services/utils/circuit-breaker.js';
import { exponentialBackoff } from '#@services/utils/exponential-backoff.js';
import { createLogger } from '#@services/utils/logger/index.js';
import { db as dbInstance } from '#@models/index.js';
import mentionTypes from '#@enums/mention-types.js';

const logger = createLogger(import.meta.url);

export class SocialMediaService {
  /** @type {SocialMediaService | null} */
  static instance = null;

  /**
   * @param {Object} [options]
   * @param {import('#@services/http/index.js')} [options.http]
   * @param {import('#@models/index.js')} [options.db]
   */
  static getInstance({ http, db } = {}) {
    if (!SocialMediaService.instance) {
      SocialMediaService.instance = new SocialMediaService({ http, db });
    }
    return SocialMediaService.instance;
  }

  /**
   * @param {Object} [options]
   * @param {import('#@services/http/index.js')} [options.http]
   * @param {import('#@models/index.js')} [options.db]
   */
  constructor({ http, db } = {}) {
    const baseHttp = http || httpInstance;
    // Apply logging decorator to base HTTP client
    this.http = withLogging(baseHttp);
    this.http.defaults.timeout = 30000; // 30 seconds

    this.db = db || dbInstance;
    this.platforms = SOCIAL_PLATFORMS.split(',');

    // Create per-platform handlers with proper keyed access
    this.httpHandlers = {};
    ['default', ...this.platforms].forEach((platform) => {
      this.httpHandlers[platform] = this.buildHttpHandler(platform);
    });

    this.platformCommentsHandlers = {
      default: {
        filterComments: (comments) => comments,
      },
      twitter: {
        filterComments: (comments, post) => {
          const twitterPost = post.postIds?.find((p) => p.platform === 'twitter');
          const twitterPostId = twitterPost?.id || twitterPost?.posts?.[0]?.id;
          return comments.filter(
            (comment) =>
              !comment.referencedTweets?.length ||
              comment.referencedTweets.find(
                (referencedTweet) => referencedTweet.id === twitterPostId
              )
          );
        },
      },
    };
  }

  /**
   * Find all posts across all configured platforms
   * @param {Object} [reqUser] - Authenticated user object
   * @param {number} [reqUser.id] - User ID
   * @param {string} [reqUser.email] - User email
   * @returns {Promise<Array>} Array of posts
   */
  async findAllPosts(reqUser) {
    const posts = [];
    for (const platform of this.platforms) {
      try {
        const response = await this.httpRequest({
          reqUser,
          platform,
          url: `/history?lastDays=${SOCIAL_MEDIA_API_HISTORY_LAST_DAYS}&platform=${platform}`,
        });
        posts.push(...(response.data?.history || []));
      } catch (error) {
        logger.error(this.getHttpErrorMessage(reqUser, platform), error);
      }
    }
    return posts;
  }

  /**
   * Find all comments for a specific post
   * @param {Object} post - Post object
   * @param {Object} [reqUser] - Authenticated user object
   * @param {number} [reqUser.id] - User ID
   * @param {string} [reqUser.email] - User email
   * @returns {Promise<Array>} Array of comments
   */
  async findAllComments(post, reqUser) {
    const comments = [];
    try {
      const response = await this.httpRequest({ reqUser, url: `/comments/${post.id}` });
      for (const platform of this.platforms) {
        try {
          const platformCommentsHandler =
            this.platformCommentsHandlers[platform] || this.platformCommentsHandlers.default;
          const platformComments = platformCommentsHandler
            .filterComments(response.data?.[platform] || [], post)
            .map((comment) => ({
              ...comment,
              apiPostId: post.id,
            }));
          comments.push(...platformComments);
        } catch (error) {
          logger.error(this.getHttpErrorMessage(reqUser, platform), error);
        }
      }
    } catch (error) {
      logger.error(`findAllComments - failed for postId: ${post.id}`, error);
    }
    return comments;
  }

  // async findAllMessages() {
  //   const messages = await processPromises({
  //     promiseFunc: async ({ entity: platform }) =>
  //       await this.httpRequest({ platform, url: `/messages/${platform}` }),
  //     entities: this.platforms,
  //     promisesLimit: this.platforms.length,
  //   });
  //   return messages;
  // }

  /**
   * Reply to a comment/mention
   * @param {Object} params
   * @param {Object} params.mention - Mention object to reply to
   * @param {string} params.content - Reply content
   * @param {Object} params.reqUser - Authenticated user object
   * @param {number} params.reqUser.id - User ID
   * @param {string} params.reqUser.email - User email
   * @param {Object} params.transaction - Database transaction
   * @returns {Promise<Object>} Reply response data
   */
  async replyComment({ mention, content, reqUser, transaction }) {
    // TODO: check if the same reply has been sent already to the social media api
    // needs to use specific comments handlers per platform, to identify comments and replies

    const response = await this.httpRequest({
      reqUser,
      platform: mention.platform,
      url: `/comments/${encodeURIComponent(mention.socialMediaPlatformRef)}/reply`,
      method: 'post',
      data: {
        comment: content,
        platforms: [mention.platform],
        searchPlatformId: true,
      },
    });

    if (response.data?.success) {
      const replyData = response.data[mention.platform];
      // create a mention attached to the original mention
      await this.db.Mention.create(
        {
          content: replyData.comment,
          socialMediaPlatformRef: replyData.commentId,
          socialMediaAPIPostRef: mention.socialMediaAPIPostRef,
          platform: mention.platform,
          type: mentionTypes.REPLY,
          data: {
            socialMediaPayload: response.data,
          },
          mentionId: mention.id,
        },
        { transaction }
      );
    }

    return response.data;
  }

  /**
   * Find circuit breaker health status for all platforms
   * @returns {Promise<Object>} Health status object with circuit states
   */
  async findHealth() {
    const states = await this.db.query(
      'SELECT circuit_name, state_data FROM circuit_breaker_states',
      { type: 'SELECT' }
    );

    const health = states.map((row) => ({
      platform: row.circuit_name,
      state: row.state_data.state,
      failures: row.state_data.failures,
      lastFailureTime: row.state_data.lastFailureTime,
      nextAttemptTime: row.state_data.nextAttemptTime,
      healthy: row.state_data.state === CIRCUIT_STATE.CLOSED,
    }));

    const allHealthy = health.every((h) => h.healthy);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      circuits: health,
    };
  }

  /**
   * @param {Object} params
   * @param {Object} [params.reqUser] - Authenticated user object
   * @param {number} [params.reqUser.id] - User ID
   * @param {string} [params.reqUser.email] - User email
   * @param {string} [params.platform] - Social media platform
   * @param {string} params.url
   * @param {string} [params.method]
   * @param {Object} [params.data] - Request data including body, headers, and other axios config options
   * @returns {Promise<Object>} HTTP response
   */
  async httpRequest({ reqUser, platform = 'default', url, method = 'get', data = {} }) {
    const httpHandler = this.httpHandlers[platform];

    if (!httpHandler) {
      throw new Error(`No handler configured for platform: ${platform}`);
    }

    // Per-request context for tracing
    const requestId = nanoid();
    const startTime = Date.now();

    try {
      const response = await httpHandler(() => {
        return this.http(`${SOCIAL_MEDIA_API_URL}${url}`, {
          ...data,
          method,
          headers: {
            ...(data.headers || {}),
            'X-Request-ID': requestId,
            Authorization: `Bearer ${SOCIAL_MEDIA_API_KEY}`,
          },
          // Pass requestId to logging interceptor for correlation
          metadata: { requestId, startTime },
        });
      });

      // Log success metrics
      logger.info('Request succeeded', {
        platform,
        url,
        method,
        requestId,
        duration: `${Date.now() - startTime}ms`,
      });

      return response;
    } catch (error) {
      // Log failure metrics
      logger.error('Request failed', {
        platform,
        url,
        method,
        requestId,
        duration: `${Date.now() - startTime}ms`,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Builds a resilient HTTP handler for a specific platform
   * Layer order (outer to inner): Retry → Circuit Breaker → Logging → Axios
   * @param {string} platform - Social media platform name
   * @returns {Function} Async function that executes HTTP requests with retry and circuit breaker
   */
  buildHttpHandler(platform) {
    // Inner layer: Circuit breaker protects the service
    /** @type {import('../utils/circuit-breaker.js').CircuitBreakerExecute} */
    const breaker = circuitBreaker({
      maxFailures: 5,
      resetTimeout: 60000,
      stateKey: platform,

      // Load state from database
      loadStateFn: async (key) => {
        const result = await this.db.query(
          'SELECT state_data FROM circuit_breaker_states WHERE circuit_name = :circuit_name',
          { replacements: { circuit_name: key }, type: 'SELECT' }
        );
        return result.length > 0 ? result[0].state_data : null;
      },

      // Save state to database
      saveStateFn: async (key, state) => {
        await this.db.query(
          `INSERT INTO circuit_breaker_states (circuit_name, state_data, "createdAt", "updatedAt")
          VALUES (:circuit_name, :state_data, NOW(), NOW())
          ON CONFLICT (circuit_name)
          DO UPDATE SET state_data = :state_data, "updatedAt" = NOW()`,
          { replacements: { circuit_name: key, state_data: JSON.stringify(state) }, type: 'INSERT' }
        );
      },

      // Monitor state changes for observability
      onStateChange: (state, data) => {
        logger.info('Circuit breaker state changed', {
          platform,
          state,
          failures: data.failures,
          lastFailureTime: data.lastFailureTime,
          nextAttemptTime: data.nextAttemptTime,
        });

        // Alert if circuit opens
        if (state === CIRCUIT_STATE.OPEN) {
          logger.warn('Circuit breaker OPEN', {
            platform,
            failures: data.failures,
            message: `Circuit breaker opened for platform: ${platform}`,
          });
        }

        // Log recovery
        if (state === CIRCUIT_STATE.CLOSED && data.failures === 0) {
          logger.info('Circuit breaker recovered', {
            platform,
            message: `Circuit breaker closed for platform: ${platform}`,
          });
        }
      },
    });

    // Outer layer: Retry wraps circuit breaker using exponentialBackoff
    const retryableHandler = exponentialBackoff({
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      factor: 2,
      // Don't retry when circuit is open; use standard HTTP retry logic otherwise
      shouldRetry: (error) => {
        // Don't retry if circuit is open or half-open
        // @ts-ignore - breaker has getState method added in circuit-breaker.js
        const currentState = breaker.getState();
        if (currentState === CIRCUIT_STATE.OPEN || currentState === CIRCUIT_STATE.HALF_OPEN) {
          return false;
        }

        // Use standard HTTP retry logic (5xx, 429, network errors)
        return shouldRetryHttpError(error);
      },
    });

    // Return a function that wraps the request with retry → circuit breaker → http
    return async (requestFn) => {
      return await retryableHandler(async () => {
        return await breaker(requestFn);
      });
    };
  }

  getHttpErrorMessage(reqUser, platform) {
    return `Error in http request for platform ${platform}, requested by ${reqUser?.email}`;
  }
}
