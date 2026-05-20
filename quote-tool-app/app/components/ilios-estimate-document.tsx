"use client";

import { buildEstimateTemplateModel } from "@/app/lib/estimate-template";
import type { QuoteRecord } from "@/app/lib/quote-record";

function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function IliosEstimateDocument({ quote }: { quote: QuoteRecord }) {
  const model = buildEstimateTemplateModel(quote);
  if (!model) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[980px] bg-white px-8 py-10 text-[#23313d]">
      <section className="rounded-[28px] border border-[#d9e2ea] bg-white px-8 py-8 shadow-[0_18px_60px_rgba(25,52,78,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-8 border-b border-[#d8e1e8] pb-8">
          <div className="max-w-[440px] space-y-4">
            <img src={model.logoSrc} alt={`${model.companyLabel} logo`} className="h-20 w-auto object-contain" />
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#6d8292]">{model.documentTitle}</div>
              <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.04em] text-[#1f2d3a]">{model.companyLegalName}</h1>
              <p className="mt-2 max-w-[420px] text-[15px] leading-[1.6] text-[#556a79]">{model.documentSubtitle}</p>
            </div>
          </div>

          <div className="min-w-[260px] rounded-[22px] border border-[#d5e0e7] bg-[#f8fbfc] px-5 py-5 text-[14px] text-[#3f5666]">
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6d8292]">Estimate details</div>
            <div className="mt-3 grid gap-3">
              <div className="flex items-center justify-between gap-4"><span>Estimate no.</span><strong className="text-[#1f2d3a]">{model.proposalNumber}</strong></div>
              <div className="flex items-center justify-between gap-4"><span>Estimate date</span><strong className="text-[#1f2d3a]">{model.proposalDate}</strong></div>
              {model.expirationDate ? <div className="flex items-center justify-between gap-4"><span>Expiration date</span><strong className="text-[#1f2d3a]">{model.expirationDate}</strong></div> : null}
              {model.providerPreparedBy ? <div className="flex items-center justify-between gap-4"><span>Prepared by</span><strong className="text-[#1f2d3a]">{model.providerPreparedBy}</strong></div> : null}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-[22px] border border-[#d5e0e7] bg-[#fbfdfe] px-5 py-5">
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6d8292]">Estimate from</div>
            <div className="mt-3 space-y-1 text-[14px] leading-[1.6] text-[#3f5666]">
              {model.providerLines.map((line) => <div key={line}>{line}</div>)}
            </div>
          </div>
          <div className="rounded-[22px] border border-[#d5e0e7] bg-[#fbfdfe] px-5 py-5">
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6d8292]">Bill to</div>
            <div className="mt-3 space-y-1 text-[14px] leading-[1.6] text-[#3f5666]">
              {model.billToLines.map((line) => <div key={line}>{line}</div>)}
            </div>
          </div>
          <div className="rounded-[22px] border border-[#d5e0e7] bg-[#fbfdfe] px-5 py-5">
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6d8292]">Ship to</div>
            <div className="mt-3 space-y-1 text-[14px] leading-[1.6] text-[#3f5666]">
              {model.shipToLines.map((line) => <div key={line}>{line}</div>)}
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-[24px] border border-[#d5e0e7]">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead className="bg-[#3388AA] text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Product or service</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Qty</th>
                <th className="px-4 py-3 font-semibold">Schedule</th>
                <th className="px-4 py-3 font-semibold">Rate</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {model.lineItems.map((item, index) => (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-[#f8fbfc]"}>
                  <td className="px-4 py-3 align-top font-medium text-[#1f2d3a]">{item.sequence}.</td>
                  <td className="px-4 py-3 align-top font-medium text-[#1f2d3a]">{item.label}</td>
                  <td className="px-4 py-3 align-top text-[#526573]">{item.description || "—"}</td>
                  <td className="px-4 py-3 align-top text-[#526573]">{item.quantity ?? "—"}{item.unit ? ` ${item.unit}` : ""}</td>
                  <td className="px-4 py-3 align-top text-[#526573]">{item.schedule === "monthly" ? "Monthly" : "One-time"}</td>
                  <td className="px-4 py-3 align-top text-[#1f2d3a]">{formatCurrency(item.rate, quote.metadata.currencyCode || "USD")}</td>
                  <td className="px-4 py-3 align-top font-semibold text-[#1f2d3a]">{formatCurrency(item.amount, quote.metadata.currencyCode || "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            {model.noteParagraphs.length ? (
              <div className="rounded-[22px] border border-[#d5e0e7] bg-[#fbfdfe] px-5 py-5">
                <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6d8292]">Note to customer</div>
                <div className="mt-3 space-y-2 text-[14px] leading-[1.7] text-[#526573]">
                  {model.noteParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </div>
            ) : null}
            {model.paymentTerms ? (
              <div className="rounded-[22px] border border-[#d5e0e7] bg-[#fbfdfe] px-5 py-5">
                <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6d8292]">Payment terms</div>
                <p className="mt-3 text-[14px] leading-[1.7] text-[#526573]">{model.paymentTerms}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-[#d5e0e7] bg-[#f8fbfc] px-5 py-5">
            <div className="space-y-3 text-[14px] text-[#3f5666]">
              <div className="flex items-center justify-between gap-4"><span>Subtotal</span><strong className="text-[#1f2d3a]">{formatCurrency(model.subtotal, quote.metadata.currencyCode || "USD")}</strong></div>
              <div className="flex items-center justify-between gap-4"><span>Sales tax</span><strong className="text-[#1f2d3a]">{formatCurrency(model.salesTaxAmount, quote.metadata.currencyCode || "USD")}</strong></div>
              <div className="h-px bg-[#d5e0e7]" />
              <div className="flex items-center justify-between gap-4 text-[18px] font-semibold text-[#1f2d3a]"><span>Total</span><strong>{formatCurrency(model.total, quote.metadata.currencyCode || "USD")}</strong></div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[24px] border border-[#d5e0e7] bg-white px-5 py-6">
          <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6d8292]">{model.signatureHeading}</div>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#526573]">{model.signatureNote || "Sign below to indicate acceptance of this estimate."}</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div>
              <div className="h-px bg-[#9baab6]" />
              <div className="mt-2 text-[12px] font-medium text-[#60707f]">Signature</div>
            </div>
            <div>
              <div className="h-px bg-[#9baab6]" />
              <div className="mt-2 text-[12px] font-medium text-[#60707f]">Customer name</div>
            </div>
            <div>
              <div className="h-px bg-[#9baab6]" />
              <div className="mt-2 text-[12px] font-medium text-[#60707f]">Date</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
