"use client";

import { useEffect, useRef } from "react";

export function ProposalPrintTrigger() {
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    if (hasPrintedRef.current) return;
    hasPrintedRef.current = true;

    const handleAfterPrint = () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      window.close();
    };

    window.addEventListener("afterprint", handleAfterPrint);

    const printTimer = window.setTimeout(() => {
      window.print();
    }, 150);

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      window.clearTimeout(printTimer);
    };
  }, []);

  return null;
}
