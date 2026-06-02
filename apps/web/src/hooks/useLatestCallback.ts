import { useCallback, useRef, useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useLatestCallback<T extends (...args: any[]) => any>(
  callback: T | undefined
): T | undefined {
  const callbackRef = useRef<T | undefined>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const latestCallback = useCallback(
    (...args: Parameters<T>): ReturnType<T> | void => {
      if (callbackRef.current) {
        return callbackRef.current(...args);
      }
    },
    []
  ) as T | undefined;

  return latestCallback;
}
