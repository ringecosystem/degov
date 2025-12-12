try {
  require('dotenv/config');
} catch {}

module.exports = {
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
