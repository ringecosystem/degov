try {
  require('dotenv/config');
} catch {}

export default {
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
};
