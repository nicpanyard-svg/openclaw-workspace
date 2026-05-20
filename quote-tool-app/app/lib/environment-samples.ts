import type { SavedCustomerProfile } from "@/app/lib/customer-profiles";
import { RAPIDQUOTE_DEPLOYMENT_KEY } from "@/app/lib/app-environment";
import {
  ensureIliosSampleProfiles,
  ensureIliosSampleProposalStore,
} from "@/app/lib/ilios-sample-data";
import {
  ensureNickTrainingDemoProfiles,
  ensureNickTrainingDemoProposalStore,
} from "@/app/lib/nick-training-demo";
import type { ProposalStoreData } from "@/app/lib/proposal-store";

export function ensureEnvironmentCustomerProfiles(profiles: SavedCustomerProfile[]) {
  if (RAPIDQUOTE_DEPLOYMENT_KEY === "ilios") {
    return ensureIliosSampleProfiles(profiles);
  }

  return ensureNickTrainingDemoProfiles(profiles);
}

export function ensureEnvironmentProposalStore(store: ProposalStoreData) {
  if (RAPIDQUOTE_DEPLOYMENT_KEY === "ilios") {
    return ensureIliosSampleProposalStore(store);
  }

  return ensureNickTrainingDemoProposalStore(store);
}
