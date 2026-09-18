import { config } from 'dotenv';

// Same precedence as Next.js: .env.local overrides .env.
config({ path: ['.env.local', '.env'], quiet: true });
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
