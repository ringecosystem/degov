import { headers } from "next/headers";
import { NextResponse } from "next/server";
import postgres from "postgres";

import type { AuthPayload, DUser } from "@/types/api";
import { Resp } from "@/types/api";

import type { NextRequest} from "next/server";

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

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const sql = postgres(databaseUrl);

    const [storedUser] =
      await sql`select * from d_user where address = ${address} limit 1`;

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

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        Resp.err("missing database please contact admin")
      );
    }
    const sql = postgres(databaseUrl);

    const [storedUser] =
      await sql`select * from d_user where address = ${address} limit 1`;
    if (!storedUser) {
      return NextResponse.json(Resp.err("unreachable, qed"));
    }
    const cui: DUser = {
      ...(storedUser as unknown as DUser),
      name: body.name ?? '',
      avatar: body.avatar ?? '',
      email: body.email ?? '',
      twitter: body.twitter ?? '',
      github: body.github ?? '',
      discord: body.discord ?? '',
      telegram: body.telegram ?? '',
      medium: body.medium ?? '',
      delegate_statement: body.delegate_statement ?? '',
      additional: body.additional ?? '',
      utime: new Date().toISOString(),
    };
    await sql`
    update d_user set ${sql(
      cui,
      "name",
      "avatar",
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
    where id=${cui.id}
    `;
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
