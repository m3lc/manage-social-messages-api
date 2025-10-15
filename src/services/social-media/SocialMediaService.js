// @ts-check

export class SocialMediaService {
  /** @type {SocialMediaService | null} */
  static instance = null;

  static getInstance() {
    if (!SocialMediaService.instance) {
      SocialMediaService.instance = new SocialMediaService();
    }
    return SocialMediaService.instance;
  }


  async findAllPosts() {

  }

  async findAllComments() {

  }

  async findAllMessages() {

  }

  async replyComment() {

  }

  async replyMessage() {

  }

  async registerMessagesWebhook() {

  }

}