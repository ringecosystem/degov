"use client";

import { DaoHeader } from "./dao-header";
import { Overview } from "./overview";
import { Proposals } from "./proposals";

export function HomeClient() {
  return (
    <div className="flex flex-col gap-[20px] lg:gap-[30px]">
      <DaoHeader />
      <Overview />
      <Proposals />
    </div>
  );
}
