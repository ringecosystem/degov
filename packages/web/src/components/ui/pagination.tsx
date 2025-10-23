import * as React from "react";

import { cn } from "@/lib/utils";

const Pagination = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"nav">
>(({ className, ...props }, ref) => (
  <nav
    ref={ref}
    role="navigation"
    aria-label="pagination"
    className={cn("flex w-full items-center", className)}
    {...props}
  />
));
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("inline-flex items-center gap-[5px]", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("list-none", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

interface PaginationLinkProps extends React.ComponentPropsWithoutRef<"button"> {
  isActive?: boolean;
}

const PaginationLink = React.forwardRef<HTMLButtonElement, PaginationLinkProps>(
  ({ className, isActive, disabled, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-7 min-w-[28px] flex-col items-center justify-center cursor-pointer",
        "rounded-[5px] px-2.5 text-sm font-normal transition-colors",
        "bg-dark text-text-secondary hover:bg-grey-1 hover:text-light",
        isActive && "bg-grey-1 text-light",
        disabled &&
          "cursor-not-allowed bg-grey-1 text-text-secondary hover:bg-grey-1 hover:text-text-secondary",
        className
      )}
      disabled={disabled}
      {...props}
    />
  )
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(({ className, disabled, ...props }, ref) => (
  <PaginationLink
    ref={ref}
    aria-label="Previous Page"
    disabled={disabled}
    className={cn(
      "w-7 px-0",
      disabled
        ? "bg-dark text-light hover:bg-dark"
        : "bg-always-dark text-always-light hover:bg-always-dark/90",
      className
    )}
    {...props}
  >
    <svg
      width="6"
      height="10"
      viewBox="0 0 6 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0.133379 5.32157L4.67851 9.8667C4.74207 9.93033 4.82309 9.97368 4.91131 9.99125C4.99952 10.0088 5.09096 9.99981 5.17406 9.96538C5.25716 9.93095 5.32817 9.87264 5.3781 9.79783C5.42804 9.72302 5.45466 9.63507 5.45459 9.54513V0.454871C5.45466 0.364925 5.42804 0.27698 5.3781 0.20217C5.32817 0.12736 5.25716 0.0690484 5.17406 0.034618C5.09096 0.000187484 4.99952 -0.00881397 4.91131 0.00875313C4.82309 0.0263202 4.74207 0.069666 4.67851 0.133303L0.133379 4.67843C0.0911207 4.72064 0.0575962 4.77077 0.0347228 4.82595C0.0118499 4.88113 7.77245e-05 4.94027 7.77245e-05 5C7.77245e-05 5.05973 0.0118499 5.11887 0.0347228 5.17405C0.0575962 5.22923 0.0911207 5.27936 0.133379 5.32157Z"
        // fill="currentColor"
        className={disabled ? "fill-grey-1" : "fill-light"}
      />
    </svg>
  </PaginationLink>
));
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(({ className, disabled, ...props }, ref) => (
  <PaginationLink
    ref={ref}
    aria-label="Next Page"
    disabled={disabled}
    className={cn(
      "w-7 px-0",
      disabled
        ? "bg-dark text-light hover:bg-dark"
        : "bg-always-dark text-always-light hover:bg-always-dark/90",
      className
    )}
    {...props}
  >
    <svg
      width="6"
      height="10"
      viewBox="0 0 6 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.32121 5.32157L0.776081 9.8667C0.712515 9.93033 0.631497 9.97368 0.543283 9.99125C0.455069 10.0088 0.363625 9.99981 0.28053 9.96538C0.197434 9.93095 0.126423 9.87264 0.0764854 9.79783C0.0265477 9.72302 -7.06438e-05 9.63507 1.40808e-07 9.54513V0.454871C-7.06438e-05 0.364925 0.0265477 0.27698 0.0764854 0.20217C0.126423 0.12736 0.197434 0.0690484 0.28053 0.034618C0.363625 0.000187484 0.455069 -0.00881397 0.543283 0.00875313C0.631497 0.0263202 0.712515 0.069666 0.776081 0.133303L5.32121 4.67843C5.36347 4.72064 5.39699 4.77077 5.41987 4.82595C5.44274 4.88113 5.45451 4.94027 5.45451 5C5.45451 5.05973 5.44274 5.11887 5.41987 5.17405C5.39699 5.22923 5.36347 5.27936 5.32121 5.32157Z"
        className={disabled ? "fill-grey-1" : "fill-light"}
      />
    </svg>
  </PaginationLink>
));
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex h-7 min-w-[28px] items-center justify-center",
      "rounded-[5px] px-2.5 text-sm font-normal text-text-secondary",
      className
    )}
  >
    …
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
