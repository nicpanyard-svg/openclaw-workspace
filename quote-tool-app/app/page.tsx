import { AuthGate } from "@/app/components/auth-shell";
import { ProposalWorkspace } from "@/app/components/proposal-workspace";

export default function Home() {
  return (
    <AuthGate>
      <ProposalWorkspace />
    </AuthGate>
  );
}
