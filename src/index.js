// @ts-check

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { APP_PORT } from '#@/config.js';
import { routes } from '#@routes/index.js';
import createLogger from '#@services/utils/logger/index.js';

const app = express();
app.disable('x-powered-by');

app.use(
  cors({
    origin: 'http://localhost:5173',
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(morgan('combined', {
app.use(
  morgan(':method :url :status :response-time ms - :res[content-length]', {
    skip: (req) => req.url.includes('.well-known/appspecific'),
  })
);

app.use('/v1/', routes);

const logger = createLogger('app');

app.listen(APP_PORT, () => {
  logger.info(`Server is running on port ${APP_PORT}`);
});
