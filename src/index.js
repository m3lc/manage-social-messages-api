// @ts-check

import express from "express";
import cors from "cors";
import { APP_PORT } from "./config.js";
import {routes} from "./routes/index.js";


const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(routes);

app.listen(APP_PORT, () => {
    console.log(`Server is running on port ${APP_PORT}`);
});
