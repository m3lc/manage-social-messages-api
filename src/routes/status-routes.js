// @ts-check

import express from 'express';
import { StatusController } from '#@controllers/status-controller.js';

const router = express.Router();
const controller = new StatusController();

router.get('/status', controller.findAll.bind(controller));
router.get('/status/health', controller.findHealth.bind(controller));

export { router as statusRoutes };
