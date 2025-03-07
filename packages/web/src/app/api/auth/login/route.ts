import { cookies } from "next/headers";
import { SiweMessage } from "siwe";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

import { Resp } from "@/types/api";

export async function POST(request: NextRequest) {
  // const nonce = CryptoJS.lib.WordArray.random(64).toString(CryptoJS.enc.Hex);
  // const cookieStore = await cookies();
  // cookieStore.set("x-degov-nonce", nonce, { secure: true, httpOnly: true });
  const { message, signature } = await request.json();
  const cookieStore = await cookies();
  const degovNonce = cookieStore.get("x-degov-nonce");
  if (!degovNonce) {
    return NextResponse.json(Resp.err("missing nonce"));
  }
  const siweMessage = new SiweMessage(message);
  const fields = await siweMessage.verify({ signature });
  if (fields.data.nonce !== degovNonce.value) {
    return NextResponse.json(Resp.err("invalid nonce"));
  }

  const token = jwt.sign({ address: fields.data.address }, "your_secret_key", {
    expiresIn: "10h",
  });

  return NextResponse.json(Resp.ok("hello"));
}
