// @ts-check

import express from "express";
import cors from "cors";
import morgan from 'morgan';
import { APP_PORT } from "./config.js";
import {routes} from "./routes/index.js";


const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(morgan('combined', {
app.use(morgan(':method :url :status :response-time ms - :res[content-length]', {
    skip: (req) => req.url.includes('.well-known/appspecific')
}));

app.use(routes);

app.listen(APP_PORT, () => {
    console.log(`Server is running on port ${APP_PORT}`);
});
