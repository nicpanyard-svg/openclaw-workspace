"use client";

import type { QuoteRecord } from "@/app/lib/quote-record";
import { ProposalDocument } from "./proposal-document";
import { QuoteExperienceDialog } from "./quote-experience-dialog";

export function CustomerPresentation({
  quote,
  onClose,
}: {
  quote: QuoteRecord;
  onClose: () => void;
}) {
  return (
    <QuoteExperienceDialog
      title="Customer presentation"
      className="qx-presentation"
      onClose={onClose}
    >
      <div className="qx-presentation-document">
        <ProposalDocument quote={quote} />
      </div>
    </QuoteExperienceDialog>
  );
}
