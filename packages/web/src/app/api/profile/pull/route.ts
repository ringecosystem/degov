import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import * as config from "../../common/config";
import { databaseConnection } from "../../common/database";
import * as graphql from "../../common/graphql";
import {
  overlayProfilesWithContributorPower,
  type StoredProfileRow,
} from "../../common/profile-power";

import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body: string[] = await request.json();
    if (!body || !body.length) {
      return NextResponse.json(Resp.err("missing request body"), {
        status: 400,
      });
    }

    const degovConfig = await config.degovConfig(request);
    const daocode = degovConfig.code;

    const sql = databaseConnection();
    const storedMembers = (await sql`
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
      where u.address in ${sql(body)} and u.dao_code = ${daocode}
    `) as StoredProfileRow[];
    const contributorsByAddress = await graphql.inspectContributorsByAddress({
      request,
      addresses: storedMembers.map((member) => member.address),
    });
    const members = overlayProfilesWithContributorPower(
      storedMembers,
      contributorsByAddress
    );

    return NextResponse.json(Resp.ok(members));
  } catch (err) {
    console.warn("err", err);
    const fullMsg = `${(err as Error)?.message || err}`;
    return NextResponse.json(
      Resp.errWithData("failed to fetch profiles", fullMsg),
      { status: 400 }
    );
  }
}
