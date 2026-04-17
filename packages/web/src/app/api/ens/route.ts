import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import * as config from "../common/config";
import { resolveEnsRecord } from "../common/ens-cache";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const name = request.nextUrl.searchParams.get("name");
    const degovConfig = await config.degovConfig(request);
    const record = await resolveEnsRecord(degovConfig, { address, name });

    return NextResponse.json(Resp.ok(record));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ENS lookup failed";
    return NextResponse.json(Resp.err(message), { status: 400 });
  }
}
