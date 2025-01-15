import { database } from "@packages/db";
import { courseView, instructorView } from "@packages/db/schema";

export default {
  async scheduled(_, env) {
    const db = database(env.DB.connectionString);
    await db.refreshMaterializedView(courseView);
    await db.refreshMaterializedView(instructorView);
    await db.$client.end({ timeout: 5 });
  },
} satisfies ExportedHandler<Env>;
