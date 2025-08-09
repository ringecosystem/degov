"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { LoadingState } from "@/components/ui/loading-spinner";

type LoadingMap = Record<string, boolean>;

interface GlobalLoadingContextValue {
  setLoading: (key: string, value: boolean) => void;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(
  null
);

export function GlobalLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loadingMap, setLoadingMap] = useState<LoadingMap>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const setLoading = useCallback((key: string, value: boolean) => {
    setLoadingMap((prev) => {
      const current = prev[key];
      if (current === value) return prev;
      const next = { ...prev, [key]: value };
      if (!value) {
        // remove the key when false to keep map small
        const { [key]: _removed, ...rest } = next;
        console.log("_removed", _removed);
        return rest;
      }
      return next;
    });
  }, []);

  const isLoading = useMemo(
    () => Object.values(loadingMap).some(Boolean),
    [loadingMap]
  );

  return (
    <GlobalLoadingContext.Provider value={{ setLoading }}>
      {children}
      {mounted &&
        isLoading &&
        createPortal(
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <LoadingState
              title="Initializing System"
              description="Loading data, please wait..."
            />
          </div>,
          document.body
        )}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx)
    throw new Error(
      "useGlobalLoading must be used within GlobalLoadingProvider"
    );
  return ctx;
}
