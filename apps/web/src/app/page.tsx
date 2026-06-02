"use client";

import { DaoHeader } from "./_components/dao-header";
import { Overview } from "./_components/overview";
import { Proposals } from "./_components/proposals";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-[20px] lg:gap-[30px]">
      <DaoHeader />
      <Overview />
      <Proposals />
    </div>
  );
}
