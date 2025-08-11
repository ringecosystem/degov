"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "./ui/button";

const NotFound = () => {
  const router = useRouter();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center ">
      <div className="flex flex-col items-center justify-center">
        <Image
          src="/assets/image/404.svg"
          alt="404"
          width={304}
          height={90}
          className="w-[304px] h-[90px] hidden dark:block"
        />
        <Image
          src="/assets/image/light/404.svg"
          alt="404"
          width={304}
          height={90}
          className="w-[304px] h-[90px] block dark:hidden"
        />
        <p className="text-center text-[16px] font-normal text-foreground mt-[60px]">
          We’ve searched the entire universe and still couldn’t find what you’re
          looking for.
        </p>
        <Button
          onClick={() => router.push("/")}
          className="h-[2.125rem] gap-[0.3125rem] mt-[20px]"
          color="primary"
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
