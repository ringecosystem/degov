import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

import { Resp } from "@/types/api";

export async function GET(request: NextRequest) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const sql = postgres(databaseUrl);

    const members = await sql`select * from d_user order by ctime desc`;

    return NextResponse.json(Resp.ok(members));
  } catch (err) {
    console.warn("err", err);
    const fullMsg = `${(err as Error)?.message || err}`;
    return NextResponse.json(
      Resp.errWithData("failed to fetch members", fullMsg),
      { status: 400 }
    );
  }
}
