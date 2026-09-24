import type { LaborTask, MajorProjectComponent } from "./quote-record";
const nonnegative = (value: number) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export function normalizeLaborTasks(tasks: LaborTask[] = []): LaborTask[] {
  return tasks.map((row, i) => ({ id: row.id || `labor-${i}`, task: String(row.task || ""), role: String(row.role || ""), people: nonnegative(row.people), hours: nonnegative(row.hours), hourlyCost: nonnegative(row.hourlyCost) }));
}
export function laborTotals(tasks: LaborTask[] = []) {
  return normalizeLaborTasks(tasks).reduce((total, row) => ({ hours: total.hours + row.people * row.hours, cost: total.cost + row.people * row.hours * row.hourlyCost }), { hours: 0, cost: 0 });
}
export function applyLaborCosts(component: MajorProjectComponent): MajorProjectComponent {
  if (!component.laborTasks?.length || !["installation", "internal_labor"].includes(component.lineType)) return component;
  const laborTasks = normalizeLaborTasks(component.laborTasks);
  const vendorUnitCost = Number(laborTotals(laborTasks).cost.toFixed(2));
  return { ...component, laborTasks, vendorUnitCost, vendorExtendedCost: Number((vendorUnitCost * component.quantity).toFixed(2)) };
}
export function laborDetails(component: MajorProjectComponent) {
  if (!component.laborTasks?.length || !["installation", "internal_labor"].includes(component.lineType)) return "";
  const tasks = normalizeLaborTasks(component.laborTasks);
  const total = laborTotals(tasks);
  return `Internal labor per unit: ${tasks.map(row => `${row.task || "Task"} (${row.role || "Unassigned"}): ${row.people} people x ${row.hours} hr x $${row.hourlyCost.toFixed(2)}/hr = $${(row.people * row.hours * row.hourlyCost).toFixed(2)}`).join("; ")}. Total ${total.hours} person-hours/unit; ${(total.hours * component.quantity).toFixed(2)} quoted person-hours.`;
}
