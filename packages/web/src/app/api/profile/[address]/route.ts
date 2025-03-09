import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { neon } from "@neondatabase/serverless";

import { AuthPayload, DUser, Resp } from "@/types/api";

export interface ProfileModifyForm {
  name?: String;
  avatar?: String;
  email?: String;
  twitter?: String;
  github?: String;
  discord?: String;
  additional?: String;
}

export async function GET(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const address = pathname.replace("/api/profile/", "").toLowerCase();

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const sql = neon(databaseUrl);

    const [storedUser] =
      await sql`select * from d_user where address = ${address} limit 1`;

    return NextResponse.json(Resp.ok(storedUser));
  } catch (e: any) {
    const fullMsg = `${e.message || e}`;
    return NextResponse.json(
      Resp.errWithData("failed to update profile", fullMsg),
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const encodedPayload = headersList.get("x-degov-auth-payload");
    const authPayload: AuthPayload = JSON.parse(
      Buffer.from(encodedPayload!, "base64").toString()
    );

    const { pathname } = request.nextUrl;
    const address = pathname.replace("/api/profile/", "").toLowerCase();
    if (address != authPayload.address) {
      return NextResponse.json(Resp.err("permission denied"), { status: 401 });
    }
    const body: ProfileModifyForm = await request.json();

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const sql = neon(databaseUrl);

    const [storedUser] =
      await sql`select * from d_user where address = ${address} limit 1`;
    if (!storedUser) {
      return NextResponse.json(Resp.err("unreachable, qed"));
    }
    const cui: DUser = {
      ...(storedUser as unknown as DUser),
      name: body.name,
      avatar: body.avatar,
      email: body.email,
      twitter: body.twitter,
      github: body.github,
      discord: body.discord,
      additional: body.additional,
      utime: new Date().toISOString(),
    };
    await sql`
      update d_user set
        name=${cui.name},
        avatar=${cui.avatar},
        email=${cui.email},
        twitter=${cui.twitter},
        github=${cui.github},
        discord=${cui.discord},
        additional=${cui.additional},
        utime=${cui.utime}
      where id=${cui.id}
    `;
    return NextResponse.json(Resp.ok("success"));
  } catch (e: any) {
    const fullMsg = `${e.message || e}`;
    return NextResponse.json(
      Resp.errWithData("failed to update profile", fullMsg),
      { status: 400 }
    );
  }
}
