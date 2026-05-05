import { ProposalDocument } from "@/app/components/proposal-document";
import { ProposalPrintTrigger } from "@/app/components/proposal-print-trigger";
import { ProposalPrintClient } from "@/app/proposal/print/print-client";
import { readCachedProposalPdfQuote } from "@/app/lib/proposal-pdf-cache";

export const dynamic = "force-dynamic";

type ProposalPrintPageProps = {
  searchParams?: Promise<{
    token?: string;
    autoprint?: string;
    pdf?: string;
    proposalId?: string;
  }>;
};

export default async function ProposalPrintPage({ searchParams }: ProposalPrintPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const cachedQuote = await readCachedProposalPdfQuote(params?.token);
  const shouldAutoPrint = params?.autoprint !== "0";

  if (cachedQuote?.quote) {
    return (
      <div className="proposal-route-shell proposal-print-shell">
        {shouldAutoPrint ? <ProposalPrintTrigger /> : null}
        <ProposalDocument quote={cachedQuote.quote} />
      </div>
    );
  }

  return <ProposalPrintClient autoPrintOnly={false} requestedProposalId={params?.proposalId ?? cachedQuote?.proposalId ?? null} />;
}
