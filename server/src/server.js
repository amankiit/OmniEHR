import app from "./app.js";
import env from "./config/env.js";
import { connectDb } from "./config/db.js";

const start = async () => {
  await connectDb(env.mongoUri);

  app.listen(env.port, () => {
    console.log(`EHR API running on port ${env.port}`);
  });
};

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
