import postgres from "postgres";

let connectedSql: postgres.Sql | undefined = undefined;

export function databaseConnection(): postgres.Sql {
  if (connectedSql) {
    return connectedSql;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("missing database please contact admin");
  }

  connectedSql = postgres(databaseUrl, {
    max: 20,
  });
  return connectedSql;
}
