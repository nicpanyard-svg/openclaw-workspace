export type SectionAMode = "pool" | "per_kit";

export type PoolRow = {
  description: string;
  monthlyRate: string;
};

export type EquipmentRow = {
  itemName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
};

export const demoQuote = {
  proposalNumber: "RCT001",
  revisionVersion: "1.0",
  proposalDate: "March 30, 2026",
  title: "MANAGED COMMUNICATIONS SERVICES",
  subtitle: "Budgetary Estimates",
  customerShortName: "Westward Env.",
  customerName: "Westward Environmental",
  customerContactName: "Chelsey J. Franklin",
  customerContactPhone: "830.249.8284",
  customerContactEmail: "Chelsey Franklin <cfranklin@westwardenv.com>",
  customerAddressLines: ["4 Shooting Club Road / PO Box 2205", "Boerne, TX 78006"],
  accountExecutiveName: "Nick Panyard",
  accountExecutivePhone: "919.864.5912",
  accountExecutiveEmail: "Nick.panyard@inetlte.com",
  inetAddressLines: ["Galleria Tower II", "5051 Westheimer, Suite 1700", "Houston, TX 77059"],
  executiveSummary: [
    "Westward Environmental is consulting on connectivity at a greenfield aggregate mining site.",
    "Under this pooled model, all Westward Environmental kits draw from a centralized data pool, eliminating the restrictions of per-kit data allotments and significantly reducing the likelihood of overage charges. This shared approach ensures greater flexibility, allows high-demand sites to consume the data they need, and maintains operational continuity across all locations.",
    "As an iNet customer, Westward Environmental will receive fully managed communications services delivered by our dedicated engineering team through our 24/7 Network Operations Center (NOC). Additionally, end users will gain access to the iNView customer portal, providing visibility into usage reporting, metrics, and the status of all Starlink terminals under one unified platform.",
    "This solution delivers a more predictable cost structure, improved reliability, and a simplified method to manage all Starlink communications infrastructure. For future streamline operations, iNet can also combine all Starlink-related services into a single consolidated invoice, making billing easier and reducing administrative overhead.",
  ],
  sectionA: {
    termMonths: 12,
    poolRows: [
      { description: "3TB, US Pool for Starlink Service", monthlyRate: "$1,050.00 USD" },
      { description: "6TB, US Pool for Starlink Service", monthlyRate: "$2,100.00 USD" },
    ] satisfies PoolRow[],
    poolOverage: "$0.55 USD",
    terminalAccessFee: "$45.00 USD",
    supportIncludedText: [
      "NOC 24/7/365 Support",
      "Customer Portal Access",
      "Reports & Metrics via iNView Portal",
    ],
    perKitRows: [
      { description: "50GB Data Block", units: "12 Blocks", monthlyRate: "$30.00 USD", subtotal: "$360.00 USD" },
      { description: "500GB Data Block", units: "2 Blocks", monthlyRate: "$132.00 USD", subtotal: "$264.00 USD" },
      { description: "Terminal Access Fee (Per Kit)", units: "10 Kits", monthlyRate: "$45.00 USD", subtotal: "$450.00 USD" },
      { description: "iNet Customer Support", units: "", monthlyRate: "", subtotal: "Included" },
    ],
  },
  sectionB: {
    lineItems: [
      {
        itemName: "Starlink Gen3 Performance (Enterprise)",
        quantity: 3,
        unitPrice: "$1,999.00 USD",
        totalPrice: "$5,997.00 USD",
      },
      {
        itemName: "Starlink Mini",
        quantity: 10,
        unitPrice: "$350.00 USD",
        totalPrice: "$3500.00 USD",
      },
      {
        itemName: "Savage Case with Charger",
        quantity: 10,
        unitPrice: "$575.00 USD",
        totalPrice: "$5750.00 USD",
      },
      {
        itemName: "Starlink Performance Pipe Adapter",
        quantity: 3,
        unitPrice: "$140.00 USD",
        totalPrice: "$420.00 USD",
      },
      {
        itemName: "Starlink Performance 50m Cable",
        quantity: 3,
        unitPrice: "$75.00 USD",
        totalPrice: "$225.00 USD",
      },
    ] satisfies EquipmentRow[],
    total: "$15,892.00 USD",
  },
  revisionHistory: [{ version: "1.0", changeDetails: "Original Document" }],
};
