import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { AuthPayload, DAvatar, DUser } from "@/types/api";
import { Resp } from "@/types/api";

import { databaseConnection } from "../../common/database";
import * as config from "../../common/config";

import type { NextRequest } from "next/server";

export interface ProfileModifyForm {
  name?: string;
  avatar?: string;
  email?: string;
  twitter?: string;
  github?: string;
  discord?: string;
  telegram?: string;
  medium?: string;
  delegate_statement?: string;
  additional?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const address = pathname.replace("/api/profile/", "").toLowerCase();

    const detectResult = await config.detectDao(request);
    if (!detectResult) {
      return NextResponse.json(
        Resp.err("failed to detect dao, please contact admin"),
        { status: 400 }
      );
    }
    const daocode = detectResult.daocode;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin"),
        { status: 400 }
      );
    }
    const sql = databaseConnection();

    const [storedUser] = await sql`
      select u.*, a.image as avatar from d_user as u
      left join d_avatar as a on u.id = a.id
      where u.address = ${address} and u.dao_code = ${daocode}
      limit 1
      `;

    return NextResponse.json(Resp.ok(storedUser));
  } catch (err) {
    console.warn("err", err);
    const fullMsg = `${(err as Error)?.message || err}`;
    return NextResponse.json(
      Resp.errWithData("failed to fetch profile", fullMsg),
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

    const detectResult = await config.detectDao(request);
    if (!detectResult) {
      return NextResponse.json(
        Resp.err("failed to detect dao, please contact admin"),
        { status: 400 }
      );
    }
    const daocode = detectResult.daocode;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin"),
        { status: 400 }
      );
    }
    const sql = databaseConnection();

    const [storedUser] =
      await sql`select * from d_user where address = ${address} and dao_code = ${daocode} limit 1`;
    if (!storedUser) {
      return NextResponse.json(Resp.err("unreachable, qed"));
    }
    const duser: DUser = {
      ...(storedUser as unknown as DUser),
      name: body.name ?? "",
      email: body.email ?? "",
      twitter: body.twitter ?? "",
      github: body.github ?? "",
      discord: body.discord ?? "",
      telegram: body.telegram ?? "",
      medium: body.medium ?? "",
      delegate_statement: body.delegate_statement ?? "",
      additional: body.additional ?? "",
      utime: new Date().toISOString(),
    };
    await sql`
    update d_user set ${sql(
      duser,
      "name",
      "email",
      "twitter",
      "github",
      "discord",
      "telegram",
      "medium",
      "delegate_statement",
      "additional",
      "utime"
    )}
    where id=${duser.id}
    `;
    if (body.avatar) {
      const [storedAvatar] =
        await sql`select * from d_avatar where id = ${duser.id} limit 1`;
      const davatar: DAvatar = {
        id: duser.id,
        image: body.avatar ?? "",
        ctime: new Date().toISOString(),
        utime: new Date().toISOString(),
      };
      if (storedAvatar) {
        await sql`
        update d_avatar set ${sql(davatar, "image", "utime")}
        where id=${davatar.id}
        `;
      } else {
        await sql`
        insert into d_avatar ${sql(davatar, "id", "image", "utime")}
        `;
      }
    }
    return NextResponse.json(Resp.ok("success"));
  } catch (err) {
    console.warn("err", err);
    const fullMsg = `${(err as Error)?.message || err}`;
    return NextResponse.json(
      Resp.errWithData("failed to update profile", fullMsg),
      { status: 400 }
    );
  }
}
