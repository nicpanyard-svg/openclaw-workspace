import Link from "next/link";
import { AuthGate } from "@/app/components/auth-shell";

type ProposalNotFoundPageProps = {
  searchParams?: Promise<{
    proposalId?: string;
  }>;
};

export default async function ProposalNotFoundPage({ searchParams }: ProposalNotFoundPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const proposalId = params?.proposalId;

  return (
    <AuthGate>
      <main className="workspace-shell">
        <div className="workspace-container detail-layout">
          <section className="workspace-hero detail-hero">
            <div>
              <div className="workspace-eyebrow">Internal proposal record</div>
              <h1 className="workspace-title">Proposal not found</h1>
              <p className="workspace-subtitle">
                {proposalId
                  ? `Proposal ${proposalId} is not available in local storage.`
                  : "The requested proposal is not available in local storage."}
              </p>
            </div>
            <div className="workspace-actions">
              <Link href="/workspace" className="workspace-primary-button">Back to Workspace</Link>
            </div>
          </section>
        </div>
      </main>
    </AuthGate>
  );
}
