import { NextResponse } from "next/server";
import * as CryptoJS from "crypto-js";
import { Resp } from "@/types/api";

export async function POST() {
  const nonce = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
  return NextResponse.json(Resp.ok({ nonce }));
}
