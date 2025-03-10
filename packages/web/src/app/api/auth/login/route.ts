import { headers } from "next/headers";
import { SiweMessage } from "siwe";
import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

import { DUser, Resp } from "@/types/api";
import toolkit from "../../common/toolkit";

export async function POST(request: NextRequest) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const { message, signature } = await request.json();
    const headersList = await headers();
    const degovNonce = headersList.get("x-degov-nonce");
    if (!degovNonce) {
      return NextResponse.json(Resp.err("missing nonce"), { status: 400 });
    }
    let fields;
    try {
      const siweMessage = new SiweMessage(message);
      fields = await siweMessage.verify({ signature });

      // fields = { data: { nonce: "3456789235", address: "0x2376628375284594" } };
    } catch (e) {
      return NextResponse.json(Resp.err("invalid message"), { status: 400 });
    }

    if (fields.data.nonce !== degovNonce) {
      return NextResponse.json(Resp.err("invalid nonce"), { status: 400 });
    }

    const jwtSecretKey = process.env.JWT_SECRET_KEY;
    if (!jwtSecretKey) {
      return NextResponse.json(
        Resp.err("please contact admin about login issue, missing key")
      );
    }

    const address = fields.data.address.toLowerCase();
    const token = await new SignJWT({ address })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(jwtSecretKey));

    const sql = postgres(databaseUrl);
    const [storedUser] =
      await sql`select * from d_user where address = ${address} limit 1`;
    if (!storedUser) {
      const newUser: DUser = {
        id: toolkit.snowflake.generate(),
        address,
        last_login_time: new Date().toISOString(),
      };
      await sql`
        insert into d_user 
        (id, address, last_login_time)
        values
        (${newUser.id}, ${newUser.address}, ${newUser.last_login_time})
      `;
    }
    storedUser.last_login_time = new Date().toISOString();
    await sql`
      update d_user set 
      last_login_time=${storedUser.last_login_time}, 
      utime=${storedUser.last_login_time} 
      where id=${storedUser.id};
    `;
    return NextResponse.json(Resp.ok({ token }));
  } catch (e: any) {
    return NextResponse.json(Resp.err("login failed"), { status: 400 });
  }
}
