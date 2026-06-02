"use client";

import { useTranslations } from "next-intl";

import ErrorDisplay from "@/components/error-display";

const Error = () => {
  const t = useTranslations("common.error");

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ErrorDisplay
        title={t("title")}
        message={t("description")}
        buttonText={t("refresh")}
        action={() => window.location.reload()}
      />
    </div>
  );
};

export default Error;
