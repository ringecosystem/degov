"use client";
import { useRouter } from "next/navigation";

import ErrorDisplay from "@/components/error-display";

const NotFound = () => {
  const router = useRouter();
  return (
    <div className="flex h-full w-full items-center justify-center">
      <ErrorDisplay
        title="404"
        message="Sorry, Page not found"
        buttonText="Back to home >"
        action={() => router.push("/")}
      />
    </div>
  );
};

export default NotFound;
