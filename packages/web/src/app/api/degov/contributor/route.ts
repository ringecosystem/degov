import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import * as graphql from "../../common/graphql";

import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(Resp.err("address is required"), { status: 400 });
  }
  const contributor = await graphql.inspectContributor(address);
  return NextResponse.json(Resp.ok(contributor));
}
