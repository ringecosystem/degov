"use client";
import { useTranslations } from "next-intl";

import { NotFoundIcon } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";

import { Button } from "./ui/button";

const NotFound = () => {
  const router = useRouter();
  const t = useTranslations("common.notFound");
  return (
    <div className="flex h-full w-full flex-col items-center justify-center ">
      <div className="flex flex-col items-center justify-center">
        <NotFoundIcon
          width={304}
          height={90}
          className="w-[304px] h-[90px] text-current"
        />
        <p className="text-center text-[16px] font-normal text-foreground mt-[60px]">
          {t("description")}
        </p>
        <Button
          onClick={() => router.push("/")}
          className="h-8.5 gap-1.25 mt-[20px]"
          color="primary"
        >
          {t("backToHome")}
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
