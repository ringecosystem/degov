import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { AuthPayload, DUser, Resp } from "@/types/api";

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const encodedPayload = headersList.get("x-degov-auth-payload");
    const authPayload: AuthPayload = JSON.parse(
      Buffer.from(encodedPayload!, "base64").toString()
    );

    return NextResponse.json(Resp.ok({ token }));
  } catch (e: any) {
    return NextResponse.json(Resp.err("logion failed"), { status: 400 });
  }
}
