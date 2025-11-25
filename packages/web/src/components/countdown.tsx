"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface CountdownProps {
  start: number; // seconds
  onEnd?: () => void;
  onTick?: (remaining: number) => void;
  className?: string;
  children?: (remaining: number, start: () => void) => ReactNode;
  onStart?: () => void;
  autoStart?: boolean;
}

export const Countdown = ({
  start,
  onEnd,
  onTick,
  className,
  children,
  onStart,
  autoStart = false,
}: CountdownProps) => {
  // Extract repeated calculation logic
  const sanitizeStart = useCallback(
    (value: number) => Math.max(0, Math.floor(value || 0)),
    []
  );

  const [remaining, setRemaining] = useState<number>(() =>
    sanitizeStart(start)
  );
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs to store callbacks, avoiding unnecessary effect re-runs
  const onEndRef = useRef(onEnd);
  const onTickRef = useRef(onTick);
  const onStartRef = useRef(onStart);

  // Update refs when callbacks change
  useEffect(() => {
    onEndRef.current = onEnd;
    onTickRef.current = onTick;
    onStartRef.current = onStart;
  }, [onEnd, onTick, onStart]);

  const startCountdown = useCallback(() => {
    if (remaining <= 0 || isRunning) return;
    setIsRunning(true);
    onStart?.();
  }, [remaining, isRunning, onStart]);

  useEffect(() => {
    const initial = sanitizeStart(start);
    setRemaining(initial);
    setIsRunning(false);

    // Use callback from ref
    if (onTickRef.current) {
      onTickRef.current(initial);
    }
    // Auto start when requested and there is time to count
    if (autoStart && initial > 0) {
      setIsRunning(true);
      onStartRef.current?.();
    }
  }, [start, sanitizeStart, autoStart]);

  useEffect(() => {
    // Clear previous timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!isRunning || remaining <= 0) {
      return;
    }

    // Start the timer
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        const remaining = Math.max(0, next);

        // Use callback from ref
        if (onTickRef.current) {
          onTickRef.current(remaining);
        }

        // Handle countdown end
        if (next <= 0) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setIsRunning(false);
          if (onEndRef.current) {
            onEndRef.current();
          }
          return 0;
        }

        return next;
      });
    }, 1000);

    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, remaining]);

  if (children)
    return <span className={className}>{children(remaining, startCountdown)}</span>;
  return <span className={className}>{remaining}s</span>;
};
