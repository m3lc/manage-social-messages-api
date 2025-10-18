// @ts-check

import { mentionRoutes } from '#@routes/mention-routes.js';
import { userRoutes } from '#@routes/user-routes.js';
import { statusRoutes } from '#@routes/status-routes.js';

export const routes = [mentionRoutes, userRoutes, statusRoutes];
