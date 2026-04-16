import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";

import type { DUser } from "@/types/api";
import { Resp } from "@/types/api";

import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  authCookieOptions,
} from "../../common/auth";
import * as config from "../../common/config";
import { databaseConnection } from "../../common/database";
import {
  SIWE_NONCE_COOKIE_NAME,
  verifySiweNonceCookieValue,
} from "../../common/siwe-nonce";
import { consumeSiweNonce } from "../../common/siwe-nonce-store";
import { snowflake } from "../../common/toolkit";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const jwtSecretKey = process.env.JWT_SECRET_KEY;
    if (!jwtSecretKey) {
      return NextResponse.json(
        Resp.err("please contact admin about login issue, missing key"),
        { status: 400 }
      );
    }

    const { message, signature } = await request.json();

    let fields;
    try {
      const siweMessage = new SiweMessage(message);
      fields = await siweMessage.verify({ signature });

      // fields = { data: { nonce: "3456789235", address: "0x2376628375284594" } };
    } catch (err) {
      console.warn("err", err);
      return NextResponse.json(Resp.err("invalid message"), { status: 400 });
    }

    // Validate if nonce is still valid
    const nonce = fields.data.nonce;
    const signedNonceCookie = request.cookies.get(SIWE_NONCE_COOKIE_NAME)?.value;
    const cookieNonce = signedNonceCookie
      ? await verifySiweNonceCookieValue(signedNonceCookie, jwtSecretKey)
      : null;
    const nonceIsValid =
      cookieNonce === nonce && (await consumeSiweNonce(nonce));

    if (!nonceIsValid) {
      const invalidNonceResponse = NextResponse.json(
        Resp.err(`nonce (${nonce}) expired or invalid, please get a new nonce`),
        { status: 400 }
      );

      invalidNonceResponse.cookies.set({
        name: SIWE_NONCE_COOKIE_NAME,
        value: "",
        maxAge: 0,
        path: "/",
      });

      return invalidNonceResponse;
    }

    const address = fields.data.address.toLowerCase();
    const token = await new SignJWT({ address })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5h")
      .sign(new TextEncoder().encode(jwtSecretKey));

    const sql = databaseConnection();
    const [storedUser] =
      await sql`
        select
          id,
          last_login_time,
          utime
        from d_user
        where address = ${address} and dao_code = ${daocode}
        limit 1
      `;
    if (!storedUser) {
      const newUser: DUser = {
        id: snowflake.generate(),
        dao_code: daocode,
        address,
        last_login_time: new Date().toISOString(),
      };
      await sql`insert into d_user ${sql(
        newUser,
        "id",
        "dao_code",
        "address",
        "last_login_time"
      )}`;
    } else {
      storedUser.last_login_time = new Date().toISOString();
      await sql`
        update d_user set 
        last_login_time=${storedUser.last_login_time}, 
        utime=${storedUser.last_login_time} 
        where id=${storedUser.id};
      `;
    }
    const response = NextResponse.json(Resp.ok({ authenticated: true }));

    response.cookies.set({
      name: SIWE_NONCE_COOKIE_NAME,
      value: "",
      maxAge: 0,
      path: "/",
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
      ...authCookieOptions(request),
    });

    return response;
  } catch (err) {
    console.warn("err", err);
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(Resp.errWithData("logion failed", message), {
      status: 400,
    });
  }
}
