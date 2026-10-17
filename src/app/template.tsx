"use client";
import { motion, useReducedMotion } from "motion/react";

/** Re-mounts on every navigation, so each page springs in. */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 130, damping: 20 }}
    >
      {children}
    </motion.div>
  );
}
