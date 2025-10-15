// @ts-check

import express from 'express';
import { StatusController } from '../controllers/StatusController.js';

const router = express.Router();
const controller = new StatusController();

router.get('/status', controller.findAll.bind(controller));

export {router as statusRoutes};
