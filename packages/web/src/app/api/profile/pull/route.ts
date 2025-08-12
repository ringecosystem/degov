import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import { databaseConnection } from "../../common/database";
import * as config from "../../common/config";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body: string[] = await request.json();
    if (!body || !body.length) {
      return NextResponse.json(Resp.err("missing request body"), {
        status: 400,
      });
    }

    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const sql = databaseConnection();

    const members = await sql`select * from d_user where address in ${sql(
      body
    )} and dao_code = ${daocode}`;

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
