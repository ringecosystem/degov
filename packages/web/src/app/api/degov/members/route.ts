import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import * as config from "../../common/config";
import { databaseConnection } from "../../common/database";
import * as graphql from "../../common/graphql";
import { rankMembersByContributorPower } from "../../common/profile-power";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const nextUrl = request.nextUrl;
    const inputLimit = nextUrl.searchParams.get("limit");
    const inputCheckpoint = nextUrl.searchParams.get("checkpoint");
    const limit = Number(inputLimit ?? 10);
    let checkpoint = 0;
    if (inputCheckpoint) {
      try {
        checkpoint = Number(inputCheckpoint) || 0;
      } catch (e) {
        console.warn(
          `user provided wrong checkpoint date ${inputCheckpoint} : ${e}`
        );
      }
    }
    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const sql = databaseConnection();
    const storedMembers = await sql`
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
        a.image as avatar
      from d_user as u
      left join d_avatar as a on u.id = a.id
      where u.dao_code = ${daocode}
    `;
    const contributorsByAddress = await graphql.inspectContributorsByAddress({
      request,
      addresses: storedMembers.map((member) => member.address),
    });
    const members = rankMembersByContributorPower(
      storedMembers,
      contributorsByAddress
    ).slice(checkpoint, checkpoint + limit);

    return NextResponse.json(Resp.ok(members));
  } catch (err) {
    console.warn("err", err);
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      Resp.errWithData("failed to fetch members", message),
      { status: 400 }
    );
  }
}
