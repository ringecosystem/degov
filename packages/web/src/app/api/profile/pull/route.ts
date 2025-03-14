import { headers } from "next/headers";
import { NextResponse } from "next/server";
import postgres from "postgres";

import { Resp } from "@/types/api";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body: string[] = await request.json();
    if (!body || body.length) {
      return NextResponse.json(Resp.err("missing request body"), {
        status: 400,
      });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin"),
        { status: 400 }
      );
    }
    const sql = postgres(databaseUrl);

    const members = await sql`select * from d_user where address in ${sql(
      body
    )}`;

    return NextResponse.json(Resp.ok(members));
  } catch (err) {
    console.warn("err", err);
    const fullMsg = `${(err as Error)?.message || err}`;
    return NextResponse.json(
      Resp.errWithData("failed to fetch profiles", fullMsg),
      { status: 400 }
    );
  }
}
