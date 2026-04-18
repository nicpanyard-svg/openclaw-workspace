import ProposalDetailClient from "@/app/components/proposal-detail-client";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;

  return <ProposalDetailClient proposalId={proposalId} />;
}
