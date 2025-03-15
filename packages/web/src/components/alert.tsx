"use client";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useState, useEffect } from "react";

import { DEFAULT_ANIMATION_DURATION } from "@/config/base";

import type { ReactNode } from "react";

interface AlertProps {
  message: ReactNode;
  closable?: boolean;
  duration?: number;
}

const alertVariants = {
  hidden: { opacity: 0, y: -5 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
};

const Alert = ({ message, closable = false, duration }: AlertProps) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => setIsVisible(false);

  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={"flex items-center justify-between w-full"}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={alertVariants}
          transition={{ duration: DEFAULT_ANIMATION_DURATION, ease: "easeOut" }}
          onAnimationComplete={(definition) => {
            if (definition === "exit") {
            }
          }}
        >
          <div className="text-[14px] w-full">{message}</div>
          {closable && (
            <button
              className="flex cursor-pointer items-center justify-center"
              onClick={handleClose}
              aria-label="Close Alert"
            >
              <X size={16} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Alert;
