import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface RawPosition {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  sector: string;
}

interface EnrichedPosition extends RawPosition {
  market_value: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
  live_price?: number;
}

// Fetch live price from Yahoo Finance (yf query1 endpoint)
async function fetchLivePrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price =
      json?.chart?.result?.[0]?.meta?.regularMarketPrice ??
      json?.chart?.result?.[0]?.meta?.previousClose ??
      null;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Try workspace data/portfolio.json first, fallback to graham paper-trades
    const portfolioPath = path.resolve(process.cwd(), "..", "data", "portfolio.json");
    const paperTradesPath = path.resolve(process.cwd(), "..", "graham-stock-board", "paper-trades.json");

    let positions: RawPosition[] = [];

    if (fs.existsSync(portfolioPath)) {
      const raw = fs.readFileSync(portfolioPath, "utf-8");
      positions = JSON.parse(raw) as RawPosition[];
    } else if (fs.existsSync(paperTradesPath)) {
      const raw = fs.readFileSync(paperTradesPath, "utf-8");
      const data = JSON.parse(raw);
      // Map paper-trades positions format to our format
      positions = (data.positions ?? []).map((p: {
        ticker: string;
        shares: number;
        entryPrice: number;
        currentPrice: number;
      }) => ({
        ticker: p.ticker,
        shares: p.shares,
        avg_cost: p.entryPrice,
        current_price: p.currentPrice,
        sector: "Tech", // no sector in paper-trades
      }));
    }

    if (positions.length === 0) {
      return NextResponse.json({ positions: [], summary: null, sectors: [] });
    }

    // Fetch live prices for all tickers in parallel (best-effort)
    const livePrices = await Promise.all(
      positions.map((p) => fetchLivePrice(p.ticker))
    );

    // Enrich positions
    const enriched: EnrichedPosition[] = positions.map((p, i) => {
      const live = livePrices[i];
      const currentPrice = live ?? p.current_price;
      const market_value = currentPrice * p.shares;
      const cost_basis = p.avg_cost * p.shares;
      const pnl = market_value - cost_basis;
      const pnl_pct = cost_basis > 0 ? (pnl / cost_basis) * 100 : 0;
      return {
        ...p,
        current_price: currentPrice,
        live_price: live ?? undefined,
        market_value,
        cost_basis,
        pnl,
        pnl_pct,
      };
    });

    // Summary stats
    const totalValue = enriched.reduce((s, p) => s + p.market_value, 0);
    const totalCost = enriched.reduce((s, p) => s + p.cost_basis, 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    // Sector breakdown
    const sectorMap: Record<string, { value: number; pnl: number }> = {};
    for (const p of enriched) {
      if (!sectorMap[p.sector]) sectorMap[p.sector] = { value: 0, pnl: 0 };
      sectorMap[p.sector].value += p.market_value;
      sectorMap[p.sector].pnl += p.pnl;
    }
    const sectors = Object.entries(sectorMap).map(([name, s]) => ({
      name,
      value: s.value,
      pnl: s.pnl,
      pct: totalValue > 0 ? (s.value / totalValue) * 100 : 0,
    })).sort((a, b) => b.value - a.value);

    return NextResponse.json({
      positions: enriched,
      summary: {
        totalValue,
        totalCost,
        totalPnl,
        totalPnlPct,
        numPositions: enriched.length,
        lastUpdated: new Date().toISOString(),
      },
      sectors,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load portfolio", detail: message }, { status: 500 });
  }
}
