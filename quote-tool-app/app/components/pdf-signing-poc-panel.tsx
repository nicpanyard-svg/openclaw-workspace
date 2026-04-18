import type { PdfExportContract } from "@/app/lib/pdf-signing-export";
import type { PdfSigningPlan } from "@/app/lib/pdf-signing-plan";

type PdfSigningPocPanelProps = {
  plan: PdfSigningPlan;
  exportContract: PdfExportContract;
};

function formatFieldType(type: string) {
  if (type === "signature") return "Signature";
  if (type === "text") return "Text";
  if (type === "date") return "Date";
  return type;
}

export function PdfSigningPocPanel({ plan, exportContract }: PdfSigningPocPanelProps) {
  return (
    <section className="pdf-signing-poc-panel no-print" aria-label="PDF signing proof of concept panel">
      <div className="pdf-signing-poc-header">
        <div>
          <div className="pdf-signing-poc-eyebrow">Jack lane · Jill-owned UI support</div>
          <h2 className="pdf-signing-poc-title">Signable / fillable PDF proof of concept</h2>
          <p className="pdf-signing-poc-copy">
            Narrow technical lane: generate a static proposal PDF with only the customer approval area left
            fillable/signable.
          </p>
        </div>
        <div className="pdf-signing-poc-badge">POC contract</div>
      </div>

      <div className="pdf-signing-poc-grid">
        <div className="pdf-signing-poc-card">
          <div className="pdf-signing-poc-card-label">Output</div>
          <div className="pdf-signing-poc-card-value">{plan.outputName}</div>
          <div className="pdf-signing-poc-card-note">{plan.strategy}</div>
        </div>

        <div className="pdf-signing-poc-card">
          <div className="pdf-signing-poc-card-label">Editable area</div>
          <div className="pdf-signing-poc-card-value">Final page approval block only</div>
          <div className="pdf-signing-poc-card-note">All other proposal content stays static / locked</div>
        </div>
      </div>

      <div className="pdf-signing-poc-card">
        <div className="pdf-signing-poc-section-title">Field map</div>
        <div className="pdf-signing-field-list">
          {plan.editableFields.map((field) => (
            <div key={field.name} className="pdf-signing-field-row">
              <div>
                <div className="pdf-signing-field-name">{field.label}</div>
                <div className="pdf-signing-field-meta">
                  {field.name} · {formatFieldType(field.type)} · {field.required ? "Required" : "Optional"}
                </div>
              </div>
              <div className="pdf-signing-field-coords">
                x:{field.x} y:{field.y} w:{field.width} h:{field.height}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pdf-signing-poc-card">
        <div className="pdf-signing-poc-section-title">What this POC means</div>
        <ul className="pdf-signing-poc-list">
          {plan.implementationNotes.currentPocScope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="pdf-signing-poc-two-up">
        <div className="pdf-signing-poc-card">
          <div className="pdf-signing-poc-section-title">Next technical step</div>
          <p className="pdf-signing-poc-copy tight">{plan.implementationNotes.nextTechnicalStep}</p>
        </div>

        <div className="pdf-signing-poc-card">
          <div className="pdf-signing-poc-section-title">Reality check</div>
          <ul className="pdf-signing-poc-list compact">
            {plan.implementationNotes.digitalSigningRealityCheck.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="pdf-signing-poc-card">
        <div className="pdf-signing-poc-section-title">Export contract snapshot</div>
        <ul className="pdf-signing-poc-list compact">
          <li>Source proposal URL: {exportContract.sourceDocumentUrl}</li>
          <li>Resolved final page index: {exportContract.finalPageIndex}</li>
          <li>Interactive pages: {exportContract.interactivePageIndexes.join(", ")}</li>
          <li>Locked document: {exportContract.lockedDocument ? "Yes" : "No"}</li>
        </ul>
      </div>
    </section>
  );
}
