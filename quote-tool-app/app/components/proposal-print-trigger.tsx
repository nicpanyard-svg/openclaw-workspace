"use client";

import { useEffect, useRef } from "react";

export function ProposalPrintTrigger() {
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    if (hasPrintedRef.current) return;
    hasPrintedRef.current = true;

    const printTimer = window.setTimeout(() => {
      window.print();
    }, 150);

    return () => {
      window.clearTimeout(printTimer);
    };
  }, []);

  return null;
}
