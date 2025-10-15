// @ts-check

import express from 'express';
import { MentionController } from '../controllers/MentionController.js';
import { MentionDataService } from '../services/data/MentionDataService.js';

const router = express.Router();
const controller = new MentionController();

router.get('/mentions', controller.findAll.bind(controller));
router.put('/mentions/:id', controller.update.bind(controller));

export {router as mentionRoutes};
