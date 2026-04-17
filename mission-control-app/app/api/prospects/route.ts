import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), "data");

    // Read all prospects_*.json files
    let files: string[] = [];
    try {
      const allFiles = await fs.readdir(dataDir);
      files = allFiles
        .filter((f) => f.match(/^prospects_\d{4}-\d{2}-\d{2}\.json$/))
        .sort()
        .reverse(); // newest first
    } catch {
      // data dir may not exist yet
      return NextResponse.json({ prospects: [], lastUpdated: null, total: 0 });
    }

    interface SalesforceFields {
      Account?: string;
      Industry?: string;
      City?: string;
      State?: string;
      LeadSource?: string;
      CampaignName?: string;
    }

    interface RawProspect {
      id?: string;
      vertical?: string;
      company?: string;
      name?: string;
      targetTitle?: string;
      linkedinUrl?: string;
      iNetFit?: string;
      inmailTemplate?: string;
      location?: string;
      salesforceFields?: SalesforceFields;
      status?: string;
      inmailSentDate?: string;
      replied?: boolean;
      qualified?: boolean;
      _sourceDate?: string;
    }

    const allProspects: RawProspect[] = [];
    let latestDate: string | null = null;

    for (const file of files) {
      const dateMatch = file.match(/^prospects_(\d{4}-\d{2}-\d{2})\.json$/);
      const fileDate = dateMatch ? dateMatch[1] : null;
      if (!latestDate && fileDate) latestDate = fileDate;

      const raw = await fs.readFile(path.join(dataDir, file), "utf-8");
      const parsed = JSON.parse(raw);
      const prospects: RawProspect[] = parsed.prospects || [];

      // Attach file date to each prospect
      prospects.forEach((p) => {
        p._sourceDate = fileDate || undefined;
      });

      allProspects.push(...prospects);
    }

    // Deduplicate by id (prefer newer file's version)
    const seen = new Set<string>();
    const deduped = allProspects.filter((p) => {
      const key = p.id ?? `${p.company}-${p.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      prospects: deduped,
      lastUpdated: latestDate,
      total: deduped.length,
    });
  } catch (err) {
    console.error("Error reading prospects:", err);
    return NextResponse.json(
      { error: "Failed to load prospects" },
      { status: 500 }
    );
  }
}
