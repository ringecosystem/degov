import { jwtVerify } from "jose";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { Resp } from "./types/api";

import type { NextRequest } from "next/server";

const NEED_AUTH_APIS = [
  { method: "post", path: "/api/profile/", mode: "prefix" },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const apipath = pathname.toLowerCase();

  const method = request.method.toLowerCase();
  let needAuth = false;
  for (const naa of NEED_AUTH_APIS) {
    if (naa.method != method) {
      continue;
    }
    const mode = naa.mode ?? "full";
    if (mode === "prefix") {
      if (apipath.startsWith(naa.path)) {
        needAuth = true;
        break;
      }
    }
    if (mode === "full") {
      if (apipath === naa.path) {
        needAuth = true;
        break;
      }
    }
  }
  if (needAuth) {
    return await verifyAuth();
  }

  return NextResponse.next();
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
