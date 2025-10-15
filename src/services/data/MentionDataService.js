// @ts-check
import dbInstance from '../../models/index.js';
import { SocialMediaService } from '../social-media/SocialMediaService.js';

export class MentionDataService {
    /** @type {MentionDataService | null} */
    static instance = null;

    /**
     * @param {Object} [options]
     * @param {import('../../models/index.js')} [options.db]
     * @param {SocialMediaService} [options.socialMediaService]
     */
    static getInstance({db, socialMediaService} = {}) {
        if (!MentionDataService.instance) {
          MentionDataService.instance = new MentionDataService({db, socialMediaService});
        }
        return MentionDataService.instance;
    }

    /**
     * @param {Object} [options]
     * @param {import('../../models/index.js')} [options.db]
     * @param {SocialMediaService} [options.socialMediaService]
     */
    constructor({db, socialMediaService} = {}) {
      this.db = db || dbInstance;
      this.socialMediaService = socialMediaService || SocialMediaService.getInstance();
    }
    
    async findAll() {
        return this.socialMediaService.findAllPosts();
    }

    async update() {
        return [];
    }
}
