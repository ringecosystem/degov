"use client";

import { motion } from "framer-motion";

import { usePathname } from "@/i18n/navigation";

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{ willChange: "opacity, transform" }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
