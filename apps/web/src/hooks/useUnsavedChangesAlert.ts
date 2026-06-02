"use client";
import { useEffect, useState } from "react";

interface UseUnsavedChangesAlertProps {
  hasChanges: boolean;
  message?: string;
  enabled?: boolean;
}

/**
 * check if the page is about to be closed and prompt the user to save the changes
 *
 * @example
 * const { setHasChanges } = useUnsavedChangesAlert({
 *   hasChanges: formState.isDirty,
 * });
 */
export function useUnsavedChangesAlert({
  hasChanges: initialHasChanges,
  message = "Please confirm that you want to leave this page. If you leave this page, your changes will be lost.",
  enabled = true,
}: UseUnsavedChangesAlertProps) {
  const [hasChanges, setHasChanges] = useState(initialHasChanges);

  // when the external hasChanges changes, update the internal state
  useEffect(() => {
    setHasChanges(initialHasChanges);
  }, [initialHasChanges]);

  // handle browser close or refresh
  useEffect(() => {
    if (!enabled || !hasChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasChanges, message, enabled]);

  // handle page navigation (link click)
  useEffect(() => {
    if (!enabled || !hasChanges) return;

    const handleClick = (e: MouseEvent) => {
      // check if the click happened on an <a> element or its internal
      let target = e.target as HTMLElement | null;
      let anchor: HTMLAnchorElement | null = null;

      while (target && !anchor) {
        if (target.tagName === "A" && target.getAttribute("href")) {
          anchor = target as HTMLAnchorElement;
        }
        target = target.parentElement;
      }

      if (!anchor) return;

      // skip external links, anchor links or links with target attribute
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        anchor.hasAttribute("target")
      ) {
        return;
      }

      // show confirm dialog
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [hasChanges, message, enabled]);

  const resetChanges = () => setHasChanges(false);

  return {
    hasChanges,
    setHasChanges,
    resetChanges,
  };
}
