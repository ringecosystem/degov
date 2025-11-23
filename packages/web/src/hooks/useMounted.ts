import { useEffect, useState } from "react";

export const useMounted = () => {
  const [mounted, setMounted] = useState(false);

  // Mark mounted after first client render to avoid hydration mismatch
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return mounted;
};
