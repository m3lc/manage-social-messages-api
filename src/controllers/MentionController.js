// @ts-check

import { MentionDataService } from "../services/data/MentionDataService.js";

export class MentionController {

    constructor(service) {
        this.service = service || MentionDataService.getInstance();
    }

    async findAll(req, res) {
      const result = await this.service.findAll();
      res.json(result);
    }

    async update(req, res) {
      const result = await this.service.update();
      res.json(result);
    }
}
