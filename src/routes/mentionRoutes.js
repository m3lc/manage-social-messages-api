// @ts-check

import express from 'express';
import { MentionController } from '../controllers/MentionController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const controller = new MentionController();

router.get('/mentions', authMiddleware, controller.findAll.bind(controller));
router.put('/mentions/:id', authMiddleware, controller.update.bind(controller));

export {router as mentionRoutes};
