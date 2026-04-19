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
      <ProposalDocument quote={quote} />
    </div>
  );
}
