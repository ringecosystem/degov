"use client";

import { SafeTable } from "@/components/treasury-table/safe-table";

export default function Treasury() {
  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[20px]">
        <h3 className="text-[18px] font-extrabold">Safe Assets</h3>
        <SafeTable />
      </div>
    </div>
  );
}
