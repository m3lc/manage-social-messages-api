// @ts-check
import dbInstance from '../../models/index.js';
import { SocialMediaService } from '../social-media/SocialMediaService.js';

export class MentionDataService {
    /** @type {MentionDataService | null} */
    static instance = null;

    static getInstance({db, socialMediaService}) {
        if (!MentionDataService.instance) {
          MentionDataService.instance = new MentionDataService({db, socialMediaService});
        }
        return MentionDataService.instance;
    }

    constructor({db, socialMediaService}) {
      this.db = db || dbInstance;
      this.socialMediaService = socialMediaService || SocialMediaService.getInstance();
    }
    
    async findAll() {
        return [];
    }

    async update() {
        return [];
    }
}
