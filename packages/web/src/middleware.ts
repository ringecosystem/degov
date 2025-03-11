import { jwtVerify } from "jose";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { Resp } from "./types/api";

import type { NextRequest } from "next/server";

const SKIP_AUTH_APIS: string[] = ["/api/auth/nonce", "/api/auth/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const apipath = pathname.toLowerCase();
  if (SKIP_AUTH_APIS.indexOf(apipath) != -1) {
    return NextResponse.next();
  }
  const method = request.method.toLowerCase();
  if (method === "get" && apipath.startsWith("/api/profile/")) {
    return NextResponse.next();
  }

  return await verifyAuth();
}

async function verifyAuth(): Promise<NextResponse> {
  const headersList = await headers();

  const authHeader = headersList.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }
  const degovToken = authHeader.split(" ")[1];
  const jwtSecretKey = process.env.JWT_SECRET_KEY;
  if (!jwtSecretKey) {
    return NextResponse.json(
      Resp.err("please contact admin about login issue, missing key")
    );
  }
  try {
    const { payload } = await jwtVerify(
      degovToken,
      new TextEncoder().encode(jwtSecretKey)
    );
    const maskedPayload = {
      ...payload,
      iat: undefined,
      exp: undefined,
    };
    const encodedPayload = Buffer.from(JSON.stringify(maskedPayload)).toString(
      "base64"
    );
    const response = NextResponse.next();
    response.headers.set("x-degov-auth-payload", encodedPayload);

    return response;
  } catch (err) {
    console.warn("err", err);
    return NextResponse.json(Resp.err("wrong token"), { status: 401 });
  }
}

export const config = {
  matcher: "/api/:path*",
};
