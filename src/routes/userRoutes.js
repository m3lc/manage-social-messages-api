// @ts-check

import express from 'express';
import { UserController } from '../controllers/UserController.js';

const router = express.Router();
const controller = new UserController();

router.post('/users/login', controller.login.bind(controller));

export {router as userRoutes};
