import * as CryptoJS from "crypto-js";
import { NextResponse } from "next/server";

import { Resp } from "@/types/api";
import { nonceCache } from "../../common/nonce-cache";

export async function POST() {
  const nonce = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
  
  // Add nonce to cache with 3-minute validity
  nonceCache.set(nonce);
  
  return NextResponse.json(Resp.ok({ nonce }));
}
