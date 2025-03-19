import { NextResponse } from "next/server";
import postgres from "postgres";

import { Resp } from "@/types/api";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin"),
        { status: 400 }
      );
    }
    const sql = postgres(databaseUrl);

    const nextUrl = request.nextUrl;
    const inputLimit = nextUrl.searchParams.get("limit");
    const inputCheckpoint = nextUrl.searchParams.get("checkpoint");
    const limit = Number(inputLimit ?? 10);
    let checkpoint = 0;
    if (inputCheckpoint) {
      try {
        checkpoint = Number(inputCheckpoint) || 0;
      } catch (e) {
        console.warn(
          `user provided wrong checkpoint date ${inputCheckpoint} : ${e}`
        );
      }
    }

    const members = await sql`
    WITH ranked_members AS (
      SELECT
        u.*,
        a.image as avatar,
        ROW_NUMBER() OVER (
          ORDER BY 
          CASE WHEN u.power = '' THEN NULL ELSE u.power END DESC NULLS LAST, 
          u.ctime DESC
        ) AS rn
      FROM d_user AS u
      LEFT JOIN d_avatar AS a ON u.id = a.id
      ORDER BY u.power desc, u.ctime DESC
    )
    SELECT * FROM ranked_members
    WHERE rn > ${checkpoint}
    ORDER BY rn
    LIMIT ${limit}
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
