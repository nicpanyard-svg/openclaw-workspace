import type { QuoteRecord } from "./quote-record";

export async function requestProFormaPdf(quote: QuoteRecord, request: typeof fetch = fetch): Promise<Blob> {
  const response = await request("/api/pro-forma-pdf", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string; missingFields?: string[] };
    throw new Error(result.missingFields?.join("; ") || result.error || "The PDF could not be generated. Please try again.");
  }
  const pdf = await response.blob();
  if (!pdf.type.includes("application/pdf") || await pdf.slice(0, 4).text() !== "%PDF") {
    throw new Error("The invoice PDF could not be verified. Please try again.");
  }
  return pdf;
}
