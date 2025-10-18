// @ts-check

import express from 'express';
import { UserController } from '#@controllers/user-controller.js';
import { authMiddleware } from '#@middleware/auth.js';

const router = express.Router();
const controller = new UserController();

router.get('/users', authMiddleware, controller.findAll.bind(controller));
router.post('/users/login', controller.login.bind(controller));

export { router as userRoutes };
