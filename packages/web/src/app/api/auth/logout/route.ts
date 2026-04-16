import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import { AUTH_COOKIE_NAME } from "../../common/auth";

export async function POST() {
  const response = NextResponse.json(Resp.ok({ authenticated: false }));

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 0,
    path: "/",
  });

  return response;
}
