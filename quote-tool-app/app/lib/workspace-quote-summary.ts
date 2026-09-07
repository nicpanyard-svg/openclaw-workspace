import type { QuoteRecord } from "./quote-record";
import { getCustomerFacingOneTimeTotal, getLeasePricingSummary, getProposalOptionCostSummary, getRecurringMonthlyTotal } from "./proposal-commercial-summary";
import { getAnnualSubscriptionSummary } from "./quote-line-billing";

export function getWorkspaceQuoteSummary(quote: QuoteRecord) {
  const lease = getLeasePricingSummary(quote);
  const annual = getAnnualSubscriptionSummary(quote);
  return {
    oneTime: getCustomerFacingOneTimeTotal(quote),
    monthly: lease.isLease ? lease.hasActiveDataAgreement ? lease.leaseMonthly : null : getRecurringMonthlyTotal(quote),
    annualFirstYear: annual.firstYearTotal,
    annualRenewal: annual.renewalTotal,
    options: getProposalOptionCostSummary(quote),
  };
}

export function customerGroupKey(name: string) {
  return name.trim().toLocaleLowerCase();
}
