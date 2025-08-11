import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import { databaseConnection } from "../../common/database";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const settedSyncToken = process.env.DEGOV_SYNC_AUTH_TOKEN;
    if (!settedSyncToken) {
      return NextResponse.json(
        Resp.err("missing sync token please contact admin"),
        { status: 400 }
      );
    }
    const headersList = await headers();
    const inputSyncToken = headersList.get("x-degov-sync-token");
    if (!inputSyncToken || inputSyncToken !== settedSyncToken) {
      return NextResponse.json(Resp.err("missing or invalid sync token"), {
        status: 400,
      });
    }
    const inputDaocode = headersList.get("x-degov-daocode");
    if (!inputDaocode) {
      return NextResponse.json(Resp.err("missing dao code"), { status: 400 });
    }

    const payloads = await request.json();
    if (!Array.isArray(payloads)) {
      return NextResponse.json(Resp.err("invalid payloads"), { status: 400 });
    }
    const sql = databaseConnection();

    const invalidMethods = [];
    for (const payload of payloads) {
      switch (payload.method) {
        case "sync.user.power": {
          // sync user power
          const { address, power } = payload.body;
          const hexPower = `0x${BigInt(power).toString(16).padStart(64, "0")}`;
          await sql`update d_user set power = ${hexPower} where address = ${address} and dao_code = ${inputDaocode}`;
          break;
        }
        default: {
          invalidMethods.push(payload.method);
        }
      }
    }
    const rdata = {
      invalidMethods,
    };
    return NextResponse.json(Resp.ok(rdata));
  } catch (err) {
    console.warn("err", err);
    return NextResponse.json(Resp.err("sync failed"), { status: 400 });
  }
}
