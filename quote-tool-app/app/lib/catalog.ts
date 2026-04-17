export type CatalogItemKind = "equipment" | "service";

export type CatalogItem = {
  id: string;
  kind: CatalogItemKind;
  label: string;
  category: string;
  source: string;
  defaultUnitPrice: number;
  unitLabel?: string;
  terminalType?: string;
  partNumber?: string;
  description?: string;
};

export const equipmentCatalog: CatalogItem[] = [
  {
    id: "perf-kit",
    kind: "equipment",
    label: "Starlink Performance Kit",
    category: "Terminal",
    source: "Starlink hardware notes + sample proposal",
    defaultUnitPrice: 1999,
    terminalType: "Performance",
    description: "Rugged enterprise kit for harsh environments and critical sites.",
  },
  {
    id: "standard-kit",
    kind: "equipment",
    label: "Starlink Standard Kit",
    category: "Terminal",
    source: "Starlink hardware notes",
    defaultUnitPrice: 599,
    terminalType: "Standard",
    description: "Default fixed-site Starlink hardware option for mainstream business deployments.",
  },
  {
    id: "mini-kit",
    kind: "equipment",
    label: "Starlink Mini Kit",
    category: "Terminal",
    source: "Starlink hardware notes + sample proposal",
    defaultUnitPrice: 499,
    terminalType: "Mini",
    description: "Portable, low-power Starlink option for mobile or temporary deployments.",
  },
  {
    id: "pipe-adapter",
    kind: "equipment",
    label: "Starlink Pipe Adapter",
    category: "Mount Adapter",
    source: "Sample proposal / mount guide stub",
    defaultUnitPrice: 75,
    description: "Adapter used to connect terminal hardware to pole or pipe-mounted structures.",
  },
  {
    id: "perf-pipe-adapter",
    kind: "equipment",
    label: "Starlink Performance Pipe Adapter",
    category: "Mount Adapter",
    source: "Sample proposal / mount guide stub",
    defaultUnitPrice: 75,
    description: "Performance-kit pipe adapter listed in the source proposal set.",
  },
  {
    id: "cable-50m",
    kind: "equipment",
    label: "50 Meter Starlink Cable",
    category: "Cable",
    source: "Sample proposal / accessories workbook stub",
    defaultUnitPrice: 150,
    description: "Extended cable run for remote or rooftop terminal placement.",
  },
  {
    id: "savage-case",
    kind: "equipment",
    label: "Savage Case with Charger",
    category: "Accessory",
    source: "Sample proposal / accessories workbook stub",
    defaultUnitPrice: 325,
    description: "Portable protective case package for field-ready Starlink transport and charging.",
  },
  {
    id: "non-pen-mount",
    kind: "equipment",
    label: "Non-Pen Mount — for Performance, Standard, and Mini",
    category: "Mount",
    source: "Mount guide stub",
    defaultUnitPrice: 500,
    description: "Non-penetrating mount option compatible with Performance, Standard, and Mini terminals.",
  },
  {
    id: "standoff-mount",
    kind: "equipment",
    label: "Standoff Mount — for Performance, Standard, and Mini",
    category: "Mount",
    source: "Mount guide stub",
    defaultUnitPrice: 50,
    description: "Stand-off mount option compatible with Performance, Standard, and Mini terminals.",
  },
];

export const sectionACatalog: CatalogItem[] = [
  {
    id: "pool-500gb",
    kind: "service",
    label: "500GB US Pool for Starlink Service",
    category: "Pool Plan",
    source: "Sample quote record",
    defaultUnitPrice: 200,
    unitLabel: "pool",
  },
  {
    id: "pool-1tb",
    kind: "service",
    label: "1TB US Pool for Starlink Service",
    category: "Pool Plan",
    source: "Builder quick-add baseline",
    defaultUnitPrice: 280,
    unitLabel: "pool",
  },
  {
    id: "pool-3tb",
    kind: "service",
    label: "3TB US Pool for Starlink Service",
    category: "Pool Plan",
    source: "Field map / source proposal",
    defaultUnitPrice: 900,
    unitLabel: "pool",
  },
  {
    id: "pool-6tb",
    kind: "service",
    label: "6TB US Pool for Starlink Service",
    category: "Pool Plan",
    source: "Field map / source proposal",
    defaultUnitPrice: 1650,
    unitLabel: "pool",
  },
  {
    id: "block-50gb",
    kind: "service",
    label: "50GB Data Block",
    category: "Per Kit Data",
    source: "Sample quote record",
    defaultUnitPrice: 30,
    unitLabel: "block",
  },
  {
    id: "block-500gb",
    kind: "service",
    label: "500GB Data Block",
    category: "Per Kit Data",
    source: "Sample quote record",
    defaultUnitPrice: 132,
    unitLabel: "block",
  },
  {
    id: "block-1tb",
    kind: "service",
    label: "1TB Data Block",
    category: "Per Kit Data",
    source: "Builder quick-add baseline",
    defaultUnitPrice: 260,
    unitLabel: "block",
  },
  {
    id: "terminal-access-fee",
    kind: "service",
    label: "Terminal Access Fee",
    category: "Recurring Fee",
    source: "Confirmed default",
    defaultUnitPrice: 45,
    unitLabel: "kit",
  },
  {
    id: "pool-overage",
    kind: "service",
    label: "Overage: Per 1.0 GB",
    category: "Pool Overage",
    source: "Source proposal",
    defaultUnitPrice: 0.55,
    unitLabel: "GB",
  },
  {
    id: "support-included",
    kind: "service",
    label: "iNet Customer Support",
    category: "Support",
    source: "Source proposal",
    defaultUnitPrice: 0,
    description: "Included NOC support and portal access row placeholder.",
  },
];
