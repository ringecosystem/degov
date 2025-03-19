import { Resp } from "@/types/api";
import { headers } from "next/headers";
import postgres from "postgres";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const settedSyncToken = process.env.DEGOV_AUTH_SYNC_TOKEN;
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
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin"),
        { status: 400 }
      );
    }

    const payloads = await request.json();
    if (!Array.isArray(payloads)) {
      return NextResponse.json(Resp.err("invalid payloads"), { status: 400 });
    }
    const invalidMethods = [];
    for (const payload of payloads) {
      switch (payload.method) {
        case "sync.user.power": {
          // sync user power
          const sql = postgres(databaseUrl);
          const { address, power } = payload.body;
          const hexPower = `0x${BigInt(power).toString(16).padStart(64, "0")}`;
          await sql`update d_user set power = ${hexPower} where address = ${address}`;
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
