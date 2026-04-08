import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { DAvatar, DUser } from "@/types/api";
import { Resp } from "@/types/api";

import { resolveAuthPayload } from "../../common/auth";
import * as config from "../../common/config";
import { databaseConnection } from "../../common/database";
import * as graphql from "../../common/graphql";
import {
  overlayProfileWithContributorPower,
  type StoredProfileRow,
} from "../../common/profile-power";

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

    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin"),
        { status: 400 }
      );
    }
    const sql = databaseConnection();

    const [storedUser] = (await sql`
      select
        u.id,
        u.dao_code,
        u.address,
        u.name,
        u.email,
        u.twitter,
        u.github,
        u.discord,
        u.telegram,
        u.medium,
        u.delegate_statement,
        u.additional,
        u.last_login_time,
        u.ctime,
        u.utime,
        coalesce(a.image, '') as avatar
      from d_user as u
      left join d_avatar as a on u.id = a.id
      where u.address = ${address} and u.dao_code = ${daocode}
      limit 1
    `) as StoredProfileRow[];

    if (!storedUser) {
      return NextResponse.json(Resp.ok(storedUser));
    }

    const contributor = await graphql.inspectContributor({
      request,
      address,
    });
    const profile = overlayProfileWithContributorPower(
      storedUser,
      new Map(
        contributor ? [[contributor.id.toLowerCase(), contributor]] : undefined
      )
    );

    return NextResponse.json(Resp.ok(profile));
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
    const authPayload = await resolveAuthPayload(headersList);
    if (!authPayload?.address) {
      return NextResponse.json(Resp.err("permission denied"), { status: 401 });
    }

    const { pathname } = request.nextUrl;
    const address = pathname.replace("/api/profile/", "").toLowerCase();
    if (address != authPayload.address.toLowerCase()) {
      return NextResponse.json(Resp.err("permission denied"), { status: 401 });
    }
    const body: ProfileModifyForm = await request.json();

    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin"),
        { status: 400 }
      );
    }
    const sql = databaseConnection();

    const [storedUser] =
      (await sql`
        select
          id,
          dao_code,
          address,
          name,
          email,
          twitter,
          github,
          discord,
          telegram,
          medium,
          delegate_statement,
          additional,
          last_login_time,
          ctime,
          utime
        from d_user
        where address = ${address} and dao_code = ${daocode}
        limit 1
      `) as StoredProfileRow[];
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
