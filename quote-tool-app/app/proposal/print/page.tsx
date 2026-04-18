import { ProposalDocument } from "@/app/components/proposal-document";
import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

export const dynamic = "force-dynamic";

type ProposalPrintPageProps = {
  searchParams: {
    quote?: string;
    mode?: string;
  };
};

export default function ProposalPrintPage({ searchParams }: ProposalPrintPageProps) {
  const quote = deserializeQuoteRecord(searchParams.quote ? decodeURIComponent(searchParams.quote) : null) ?? sampleQuoteRecord;
  const isPdfMode = searchParams.mode === "pdf";

  return (
    <div className={isPdfMode ? "proposal-route-shell proposal-print-shell" : "proposal-route-shell"}>
      <ProposalDocument quote={quote} />
    </div>
  );
}
