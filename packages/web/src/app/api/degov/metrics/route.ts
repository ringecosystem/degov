import { NextResponse } from "next/server";
import postgres from "postgres";

import { Resp } from "@/types/api";

export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const sql = postgres(databaseUrl);

    const [memberCount] = await sql`select count(1) as c from d_user`;

    const data: MetricsData = {
      member_count: +(memberCount.c ?? 0),
    };
    return NextResponse.json(Resp.ok(data));
  } catch (err) {
    console.warn("err", err);
    const fullMsg = `${(err as Error)?.message || err}`;
    return NextResponse.json(
      Resp.errWithData("failed to fetch members", fullMsg),
      { status: 400 }
    );
  }
}

interface MetricsData {
  member_count: number;
}
