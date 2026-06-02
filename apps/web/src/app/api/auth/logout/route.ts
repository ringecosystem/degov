import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import { AUTH_COOKIE_NAME, authCookieOptions } from "../../common/auth";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json(Resp.ok({ authenticated: false }));

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    maxAge: 0,
    ...authCookieOptions(request),
  });

  return response;
}
