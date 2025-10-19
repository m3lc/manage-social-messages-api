// @ts-check

export class BaseMentionAdapter {
  async fetchAndSyncMentions(reqUser) {
    throw new Error('fetchAndSyncMentions() must be implemented');
  }

  async reply({ mention, content, reqUser }) {
    throw new Error('reply() must be implemented');
  }

  /**
   * @returns {Promise<{ isSyncing: boolean }>}
   */
  async isSyncing() {
    throw new Error('isSyncing() must be implemented');
  }

  init() {
    throw new Error('init() must be implemented');
  }
}
