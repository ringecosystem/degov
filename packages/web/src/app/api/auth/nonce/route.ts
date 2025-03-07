import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as CryptoJS from "crypto-js";
import { Resp } from "@/types/api";

export async function POST() {
  const nonce = CryptoJS.lib.WordArray.random(64).toString(CryptoJS.enc.Hex);
  const cookieStore = await cookies();
  cookieStore.set("x-degov-nonce", nonce, { secure: true, httpOnly: true });
  return NextResponse.json(Resp.ok({ nonce }));
}
