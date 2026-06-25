import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payloads = await request.json();
    if (!Array.isArray(payloads)) {
      return NextResponse.json(Resp.err("invalid payloads"), { status: 400 });
    }

    const invalidMethods = payloads.map((payload) => payload.method);

    return NextResponse.json(
      Resp.ok({
        invalidMethods,
      })
    );
  } catch (err) {
    console.warn("err", err);
    return NextResponse.json(Resp.err("sync failed"), { status: 400 });
  }
}
