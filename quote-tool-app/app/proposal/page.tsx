import { Suspense } from "react";
import { ProposalClient } from "@/app/proposal/proposal-client";

type ProposalPageProps = {
  searchParams?: Promise<{
    proposalId?: string;
  }>;
};

function ProposalPageFallback() {
  return <div className="proposal-route-shell"><div className="proposal-toolbar no-print"><div className="proposal-toolbar-title">Loading proposal preview...</div></div></div>;
}

export default async function ProposalPage({ searchParams }: ProposalPageProps) {
  const params = searchParams ? await searchParams : undefined;

  return (
    <Suspense fallback={<ProposalPageFallback />}>
      <ProposalClient requestedProposalId={params?.proposalId ?? null} />
    </Suspense>
  );
}
