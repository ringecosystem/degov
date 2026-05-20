export function isPostgresSerializationFailure(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    driverError?: { code?: unknown; message?: unknown };
  } | null;

  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  return (
    candidate.code === "40001" ||
    candidate.driverError?.code === "40001" ||
    String(candidate.message ?? "").includes("could not serialize access") ||
    String(candidate.driverError?.message ?? "").includes("could not serialize access")
  );
}

export function serializationRetryDelayMs(attempt: number): number {
  return Math.min(60_000, 5_000 * Math.max(1, attempt));
}
