import { AuthGate } from "@/app/components/auth-shell";
import { RapidQuoteFrontDoor } from "@/app/components/rapidquote-front-door";

export default function Home() {
  return (
    <AuthGate>
      <RapidQuoteFrontDoor />
    </AuthGate>
  );
}
