import { NextResponse } from "next/server";
import postgres from "postgres";

import { Resp } from "@/types/api";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const sql = postgres(databaseUrl);

    const nextUrl = request.nextUrl;
    const inputLimit = nextUrl.searchParams.get("limit");
    const inputCheckpoint = nextUrl.searchParams.get("checkpoint");
    const limit = Number(inputLimit ?? 10);
    let checkpoint = new Date(0).toISOString();
    if (inputCheckpoint) {
      try {
        checkpoint = new Date(inputCheckpoint).toISOString();
      } catch (e) {
        console.warn(
          `user provided wrong checkpoint date ${inputCheckpoint} : ${e}`
        );
      }
    }

    const members = await sql`
    select * from d_user where ctime>${checkpoint}
    order by ctime desc
    limit ${limit}
    `;

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
