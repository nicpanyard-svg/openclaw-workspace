import { ProposalDocument } from "@/app/components/proposal-document";
import { deserializeQuoteRecord } from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

type ProposalPrintPageProps = {
  searchParams: Promise<{
    quote?: string;
    mode?: string;
  }>;
};

export default async function ProposalPrintPage({ searchParams }: ProposalPrintPageProps) {
  const params = await searchParams;
  const quote = deserializeQuoteRecord(params.quote ? decodeURIComponent(params.quote) : null) ?? sampleQuoteRecord;
  const isPdfMode = params.mode === "pdf";

  return (
    <div className={isPdfMode ? "proposal-route-shell proposal-print-shell" : "proposal-route-shell"}>
      <ProposalDocument quote={quote} />
    </div>
  );
}
