"use client";
import type { MajorProjectComponent, LaborTask } from "../lib/quote-record";
import { applyLaborCosts, laborTotals } from "../lib/labor-breakdown";
export function LaborBreakdown({ component, onChange }: { component: MajorProjectComponent; onChange: (component: MajorProjectComponent) => void }) {
  const rows = component.laborTasks || [];
  const total = laborTotals(rows);
  const save = (laborTasks: LaborTask[]) => onChange(applyLaborCosts({ ...component, laborTasks, ...(laborTasks.length ? {} : { vendorUnitCost: 0, vendorExtendedCost: 0 }) }));
  const update = (id: string, patch: Partial<LaborTask>) => save(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  return <section className="mt-4 rounded-xl border border-slate-200 p-4" aria-label="Internal labor breakdown">
    <h4 className="font-semibold">Internal labor breakdown</h4>
    <p className="text-sm text-slate-500">Enter tasks for one line-item unit. People × hours × hourly cost sets the unit cost. Line quantity multiplies the total. Task details stay internal; customer pricing is set separately.</p>
    {rows.map((row, index) => <div key={row.id} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <label className="builder-field compact"><span>Task {index + 1}</span><input value={row.task} placeholder="Installation, travel, testing…" onChange={e => update(row.id, { task: e.target.value })} /></label>
      <label className="builder-field compact"><span>Role</span><input value={row.role} placeholder="Field technician" onChange={e => update(row.id, { role: e.target.value })} /></label>
      {([['people', 'People'], ['hours', 'Hours / person'], ['hourlyCost', 'Cost / hour']] as const).map(([key, label]) => <label key={key} className="builder-field compact"><span>{label}</span><input aria-label={`Task ${index + 1} ${label}`} type="number" min="0" step={key === 'people' ? '1' : '0.25'} value={row[key]} onChange={e => update(row.id, { [key]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}
      <div className="text-sm"><p>{(row.people * row.hours).toFixed(2)} person-hours</p><p>${(row.people * row.hours * row.hourlyCost).toFixed(2)}</p><button type="button" onClick={() => save(rows.filter(item => item.id !== row.id))} aria-label={`Remove labor task ${index + 1}`}>Remove</button></div>
    </div>)}
    <button type="button" className="proposal-secondary-button mt-3" onClick={() => save([...rows, { id: crypto.randomUUID(), task: "", role: "", people: 1, hours: 0, hourlyCost: 0 }])}>Add labor task</button>
    {rows.length > 0 && <p className="mt-3 font-semibold">{total.hours.toFixed(2)} person-hours / unit · ${total.cost.toFixed(2)} / unit · {(total.hours * component.quantity).toFixed(2)} total hours · ${(Number(total.cost.toFixed(2)) * component.quantity).toFixed(2)} total cost</p>}
  </section>;
}
