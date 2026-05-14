import { Hono } from "hono";
import { logger } from "hono/logger";
import demo from "./routes/demo";

export { pool, db } from "./db/client";

const app = new Hono();

app.use(logger());

app.route("/demo", demo);

export default app;
