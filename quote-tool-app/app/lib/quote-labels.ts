type NamedItem = { internalName: string; customerFacingLabel?: string; customerLabelOverride?: boolean };

export function isCustomerLabelLinked(item: NamedItem) {
  if (typeof item.customerLabelOverride === "boolean") return !item.customerLabelOverride;
  return !item.customerFacingLabel?.trim() || item.customerFacingLabel.trim() === item.internalName.trim();
}

export function renameQuoteItem<T extends NamedItem>(item: T, internalName: string): T {
  return isCustomerLabelLinked(item)
    ? { ...item, internalName, customerFacingLabel: internalName, customerLabelOverride: false }
    : { ...item, internalName, customerLabelOverride: true };
}

export function setCustomerLabelLinked<T extends NamedItem>(item: T, linked: boolean): T {
  return { ...item, customerLabelOverride: !linked, customerFacingLabel: linked ? item.internalName : item.customerFacingLabel || item.internalName };
}
