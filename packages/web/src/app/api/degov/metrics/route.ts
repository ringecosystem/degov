import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import * as config from "../../common/config";
import { databaseConnection } from "../../common/database";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const sql = databaseConnection();

    const [memberCount] =
      await sql`select count(1) as c from d_user where dao_code = ${daocode}`;

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
