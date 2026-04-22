import { ProposalDocument } from "@/app/components/proposal-document";
import { ProposalPrintClient } from "@/app/proposal/print/print-client";
import { readCachedProposalPdfQuote } from "@/app/lib/proposal-pdf-cache";

export const dynamic = "force-dynamic";

type ProposalPrintPageProps = {
  searchParams?: Promise<{
    token?: string;
    autoprint?: string;
    pdf?: string;
  }>;
};

export default async function ProposalPrintPage({ searchParams }: ProposalPrintPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const tokenQuote = await readCachedProposalPdfQuote(params?.token);
  const shouldAutoPrint = params?.autoprint !== "0";

  if (tokenQuote) {
    return (
      <div className="proposal-route-shell proposal-print-shell">
        {shouldAutoPrint ? <ProposalPrintClient autoPrintOnly /> : null}
        <ProposalDocument quote={tokenQuote} />
      </div>
    );
  }

  return <ProposalPrintClient autoPrintOnly={false} />;
}
