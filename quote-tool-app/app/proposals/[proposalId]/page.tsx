import { AuthGate } from "@/app/components/auth-shell";
import ProposalDetailClient from "@/app/components/proposal-detail-client";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;

  return (
    <AuthGate>
      <ProposalDetailClient proposalId={proposalId} />
    </AuthGate>
  );
}
