"use client";

import Image from "next/image";
import Link from "next/link";

import { Empty } from "@/components/ui/empty";
import { useDaoConfig } from "@/hooks/useDaoConfig";

export default function AppsPage() {
  const daoConfig = useDaoConfig();

  if (!daoConfig?.apps || daoConfig.apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Empty label="No Apps Available" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-extrabold">Apps</h1>
      </div>

      <div
        className="lg:grid gap-[20px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, 280px)" }}
      >
        {daoConfig.apps.map((app, index) => (
          <Link
            key={index}
            href={app.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block mb-[20px] lg:mt-0"
          >
            <div className="w-full lg:w-[280px] lg:h-[280px] bg-card rounded-[14px] flex flex-row lg:flex-col gap-[20px] items-center px-[20px] py-[20px] lg:py-[40px] transition-all duration-200 hover:bg-card/80 shadow-card">
              <Image
                src={app.icon}
                alt={app.name}
                width={100}
                height={100}
                className="rounded-full flex-shrink-0"
              />
              <div className="flex flex-col justify-center gap-[5px] items-start lg:items-center">
                <h3 className="text-[18px] font-semibold text-center text-foreground mb-[8px] group-hover:text-foreground/80 transition-colors leading-[100%]">
                  {app.name}
                </h3>
                <p className="text-[14px] text-muted-foreground text-left lg:text-center line-clamp-3 leading-[1.2]">
                  {app.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
