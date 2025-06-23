import React from "react";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  className,
}) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary",
        sizeClasses[size],
        className
      )}
    />
  );
};

interface LoadingStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = "Loading...",
  description,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4",
        className
      )}
    >
      <LoadingSpinner size="lg" className="mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {description}
        </p>
      )}
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4",
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-destructive"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
          {description}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          Try Again
        </button>
      )}
    </div>
  );
};
