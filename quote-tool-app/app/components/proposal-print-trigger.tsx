"use client";

import { useEffect, useRef } from "react";

function waitForAttachmentReady(maxWaitMs = 5000) {
  return new Promise<void>((resolve) => {
    const startedAt = Date.now();

    const check = () => {
      const proposalShell = document.querySelector(".proposal-shell");
      if (!proposalShell || proposalShell.getAttribute("data-attachments-ready") === "true" || Date.now() - startedAt >= maxWaitMs) {
        resolve();
        return;
      }

      window.setTimeout(check, 100);
    };

    check();
  });
}

export function ProposalPrintTrigger() {
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    if (hasPrintedRef.current) return;
    hasPrintedRef.current = true;
    let isCancelled = false;

    const printTimer = window.setTimeout(() => {
      void waitForAttachmentReady().then(() => {
        if (!isCancelled) {
          window.print();
        }
      });
    }, 150);

    return () => {
      isCancelled = true;
      window.clearTimeout(printTimer);
    };
  }, []);

  return null;
}
