import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import { resolveAuthPayload } from "../../common/auth";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authPayload = await resolveAuthPayload(request.headers, request.cookies);

  return NextResponse.json(
    Resp.ok({
      authenticated: Boolean(authPayload?.address),
      address: authPayload?.address ?? null,
    })
  );
}
