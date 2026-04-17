import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import https from "https";

const DATA_ROOT = path.resolve(process.cwd(), "..", "data");
const CONFIG_PATH = path.join(DATA_ROOT, "position-sizing-config.json");
const SCORES_PATH = path.join(DATA_ROOT, "stock-scores.json");
const ALERTS_PATH = path.join(DATA_ROOT, "alerts.json");
const OUTPUT_PATH = path.join(DATA_ROOT, "position-sizes.json");

interface SizingConfig {
  portfolioSize: number;
  maxPositionPct: number;
  maxRiskPerTradePct: number;
  defaultStopLossPct: number;
}

interface StockScore {
  ticker: string;
  company: string;
  stage: string;
  theme: string;
  rawData?: { price?: number };
}

interface Alert {
  ticker: string;
  type: string;
  price: number;
}

interface PositionResult {
  ticker: string;
  company: string;
  stage?: string;
  theme?: string;
  currentPrice?: number;
  stopLossPrice?: number;
  stopLossSource?: string;
  stopLossPct?: number;
  maxPositionDollars?: number;
  maxPositionShares?: number;
  riskAdjustedShares?: number;
  recommendedShares?: number;
  costBasis?: number;
  maxLossDollars?: number;
  allocationPct?: number;
  riskStatus?: "green" | "yellow" | "red";
  error?: string;
}

function fetchYahooPrice(ticker: string): Promise<number | null> {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const price =
            json?.chart?.result?.[0]?.meta?.regularMarketPrice ||
            json?.chart?.result?.[0]?.meta?.previousClose ||
            null;
          resolve(price ? parseFloat(price) : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

function roundToClean(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1000) return Math.round(n / 100) * 100;
  if (n >= 100) return Math.round(n / 10) * 10;
  if (n >= 10) return Math.round(n / 5) * 5;
  return n;
}

function getRiskStatus(
  allocationPct: number,
  maxPositionPct: number,
  actualRiskPct: number,
  maxRiskPerTradePct: number
): "green" | "yellow" | "red" {
  if (allocationPct > maxPositionPct * 1.1 || actualRiskPct > maxRiskPerTradePct * 1.1) return "red";
  if (allocationPct > maxPositionPct * 0.9 || actualRiskPct > maxRiskPerTradePct * 0.9) return "yellow";
  return "green";
}

function calcPositionSize(params: {
  portfolioSize: number;
  maxPositionPct: number;
  maxRiskPerTradePct: number;
  currentPrice: number;
  stopLossPrice: number | null;
  defaultStopLossPct: number;
}): Omit<PositionResult, "ticker" | "company" | "stage" | "theme"> {
  const { portfolioSize, maxPositionPct, maxRiskPerTradePct, currentPrice, stopLossPrice, defaultStopLossPct } = params;

  const maxPositionDollars = (portfolioSize * maxPositionPct) / 100;
  const effectiveStop =
    stopLossPrice !== null && stopLossPrice !== undefined
      ? stopLossPrice
      : currentPrice * (1 - defaultStopLossPct / 100);

  const riskPerShare = currentPrice - effectiveStop;
  const stopLossPct = riskPerShare / currentPrice;
  const maxRiskDollars = (portfolioSize * maxRiskPerTradePct) / 100;

  const riskAdjustedShares = riskPerShare > 0 ? Math.floor(maxRiskDollars / riskPerShare) : 0;
  const maxPositionShares = Math.floor(maxPositionDollars / currentPrice);
  const rawRecommended = Math.min(riskAdjustedShares, maxPositionShares);
  const recommendedShares = roundToClean(rawRecommended);

  const costBasis = recommendedShares * currentPrice;
  const maxLossDollars = recommendedShares * riskPerShare;
  const allocationPct = (costBasis / portfolioSize) * 100;

  const riskStatus = getRiskStatus(
    allocationPct,
    maxPositionPct,
    (maxLossDollars / portfolioSize) * 100,
    maxRiskPerTradePct
  );

  return {
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    stopLossPrice: parseFloat(effectiveStop.toFixed(2)),
    stopLossSource: stopLossPrice !== null && stopLossPrice !== undefined ? "alerts" : "default",
    stopLossPct: parseFloat((stopLossPct * 100).toFixed(2)),
    maxPositionDollars: parseFloat(maxPositionDollars.toFixed(2)),
    maxPositionShares,
    riskAdjustedShares,
    recommendedShares,
    costBasis: parseFloat(costBasis.toFixed(2)),
    maxLossDollars: parseFloat(maxLossDollars.toFixed(2)),
    allocationPct: parseFloat(allocationPct.toFixed(2)),
    riskStatus,
  };
}

// GET - return saved position sizes
export async function GET() {
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    // Return empty structure if file doesn't exist
    const configRaw = fs.existsSync(CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
      : { portfolioSize: 50000, maxPositionPct: 5, maxRiskPerTradePct: 1, defaultStopLossPct: 8 };
    return NextResponse.json({ generated: null, config: configRaw, results: [] });
  }
}

// POST - recalculate with optional config override
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Load base config, allow body overrides
    const savedConfig: SizingConfig = fs.existsSync(CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
      : { portfolioSize: 50000, maxPositionPct: 5, maxRiskPerTradePct: 1, defaultStopLossPct: 8 };

    const config: SizingConfig = {
      portfolioSize: body.portfolioSize ?? savedConfig.portfolioSize,
      maxPositionPct: body.maxPositionPct ?? savedConfig.maxPositionPct,
      maxRiskPerTradePct: body.maxRiskPerTradePct ?? savedConfig.maxRiskPerTradePct,
      defaultStopLossPct: body.defaultStopLossPct ?? savedConfig.defaultStopLossPct,
    };

    // Save config if changed
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    const scoresData = JSON.parse(fs.readFileSync(SCORES_PATH, "utf-8"));
    const alerts: Alert[] = fs.existsSync(ALERTS_PATH)
      ? JSON.parse(fs.readFileSync(ALERTS_PATH, "utf-8"))
      : [];

    // Build stop-loss map
    const stopLossMap: Record<string, number> = {};
    for (const alert of alerts) {
      if (alert.type === "stop_loss" || alert.type === "breakdown") {
        if (!stopLossMap[alert.ticker] || alert.price < stopLossMap[alert.ticker]) {
          stopLossMap[alert.ticker] = alert.price;
        }
      }
    }

    const stocks: StockScore[] = scoresData.scores || [];

    // Fetch live prices in parallel
    const prices = await Promise.all(
      stocks.map(async (stock) => {
        const live = await fetchYahooPrice(stock.ticker);
        return { ticker: stock.ticker, price: live ?? stock.rawData?.price ?? null };
      })
    );

    const priceMap: Record<string, number | null> = {};
    for (const p of prices) priceMap[p.ticker] = p.price;

    const results: PositionResult[] = stocks.map((stock) => {
      const currentPrice = priceMap[stock.ticker];
      if (!currentPrice) {
        return { ticker: stock.ticker, company: stock.company, error: "No price available" };
      }
      const sizing = calcPositionSize({
        portfolioSize: config.portfolioSize,
        maxPositionPct: config.maxPositionPct,
        maxRiskPerTradePct: config.maxRiskPerTradePct,
        currentPrice,
        stopLossPrice: stopLossMap[stock.ticker] ?? null,
        defaultStopLossPct: config.defaultStopLossPct,
      });
      return {
        ticker: stock.ticker,
        company: stock.company,
        stage: stock.stage,
        theme: stock.theme,
        ...sizing,
      };
    });

    const output = { generated: new Date().toISOString(), config, results };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    return NextResponse.json(output);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
