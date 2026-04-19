import { AuthGate } from "@/app/components/auth-shell";
import QuotePreview from "@/app/components/quote-preview";

export default function NewProposalPage() {
  return (
    <AuthGate>
      <QuotePreview />
    </AuthGate>
  );
}
