import { AuthGate } from "@/app/components/auth-shell";
import { ProposalWorkspace } from "@/app/components/proposal-workspace";

export default function ProposalWorkspacePage() {
  return (
    <AuthGate>
      <ProposalWorkspace />
    </AuthGate>
  );
}
