import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

function getAnthropicKey(): string {
  // Try env var first
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Try openclaw agent auth-profiles
  try {
    const profilesPath = path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      ".openclaw", "agents", "main", "agent", "auth-profiles.json"
    );
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
    const token = profiles?.profiles?.["anthropic:manual"]?.token;
    if (token) return token;
  } catch {}
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Load board data from the expanded v2 board
    let boardSummary = "No board data available.";
    try {
      // Try graham-board (v2, 40+ cards) first, fall back to stocks/
      let boardPath = path.resolve(process.cwd(), "public", "graham-board", "board.seed.json");
      if (!fs.existsSync(boardPath)) {
        boardPath = path.resolve(process.cwd(), "public", "stocks", "board.seed.json");
      }
      const board = JSON.parse(fs.readFileSync(boardPath, "utf-8"));
      const top = (board.cards || [])
        .sort((a: { grahamScore: number }, b: { grahamScore: number }) => b.grahamScore - a.grahamScore)
        .slice(0, 15);
      boardSummary = top
        .map((c: { ticker: string; company: string; grahamScore: number; status: string; stage: string; conviction: number; starterBuy: string; upside: string }) =>
          `${c.ticker} ${c.company} (score ${c.grahamScore}, ${c.status}, ${c.stage}, conviction ${c.conviction}/5, starter: ${c.starterBuy}, upside: ${c.upside})`
        )
        .join("\n") || "No cards on board.";
    } catch {}

    // Load portfolio data
    let portfolioSummary = "No portfolio data available.";
    try {
      let tradesPath = path.resolve(process.cwd(), "public", "graham-board", "paper-trades.json");
      if (!fs.existsSync(tradesPath)) {
        tradesPath = path.resolve(process.cwd(), "public", "stocks", "paper-trades.json");
      }
      const portfolio = JSON.parse(fs.readFileSync(tradesPath, "utf-8"));
      const positions = (portfolio.positions || [])
        .map((p: { ticker: string; shares: number; entryPrice: number; currentPrice?: number; cost: number; pnl?: number; pnlPct?: number }) =>
          `${p.ticker}: ${p.shares} shares @ $${p.entryPrice} (current $${p.currentPrice ?? "?"}, P&L $${p.pnl ?? "?"} / ${p.pnlPct ?? "?"}%)`
        )
        .join("\n");
      const cash = portfolio.cash ?? "unknown";
      const value = portfolio.portfolioValue ?? "unknown";
      const pnl = portfolio.totalPnl ?? 0;
      portfolioSummary = `Portfolio value: $${value}. Cash: $${cash}. Total P&L: $${pnl}.\n${positions || "No open positions."}`;
    } catch {}

    const prompt = `You are Graham, a value-oriented growth stock analyst for Nick Panyard. You manage a paper portfolio and maintain a stock board with conviction scores.\n\nCurrent Board (top 15 by score):\n${boardSummary}\n\nCurrent Portfolio:\n${portfolioSummary}\n\nAnswer this question concisely and with conviction levels: ${message}`;

    // Use OpenAI GPT-4o-mini (much cheaper than Anthropic direct)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json({ reply: "Graham chat is not configured yet. Set OPENAI_API_KEY." }, { status: 500 });
    }

    let reply: string;
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      reply = response.choices[0]?.message?.content || "No response.";
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ reply: "Graham is thinking... (" + detail.slice(0, 80) + ")" });
    }

    return NextResponse.json({ reply });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "Graham chat failed", detail }, { status: 500 });
  }
}
