import Link from "next/link";
import { ProposalDocument } from "@/app/components/proposal-document";
import { ProposalPrintTrigger } from "@/app/components/proposal-print-trigger";
import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

export const dynamic = "force-dynamic";

type ProposalPrintPageProps = {
  searchParams: {
    quote?: string;
  };
};

export default function ProposalPrintPage({ searchParams }: ProposalPrintPageProps) {
  const quote = deserializeQuoteRecord(searchParams.quote ? decodeURIComponent(searchParams.quote) : null) ?? sampleQuoteRecord;

  return (
    <div className="proposal-route-shell proposal-print-shell">
      <ProposalPrintTrigger />
      <div className="proposal-toolbar no-print">
        <div>
          <div className="proposal-toolbar-label">Print-ready document</div>
          <div className="proposal-toolbar-title">Print Proposal</div>
          <div className="proposal-toolbar-subtitle">
            The print dialog opens automatically once. If you need another copy, use your browser print command. This tab stays open so you can return without the preview page getting stuck.
          </div>
        </div>
        <div className="proposal-toolbar-actions">
          <Link href="/proposal" className="proposal-secondary-button">
            Back to Preview
          </Link>
        </div>
      </div>
      <ProposalDocument quote={quote} />
    </div>
  );
}
