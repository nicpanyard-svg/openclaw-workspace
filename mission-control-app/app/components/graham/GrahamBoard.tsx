"use client";

import { useState, useEffect, useCallback } from "react";
import type { BoardData, StockCardData, SortMode, StatusFilter } from "./types";
import StockCard from "./StockCard";
import StockModal from "./StockModal";
import CommodityBar from "./CommodityBar";
import FilterControls from "./FilterControls";
import { ScoreRankingChart, ScoreVsUpsideChart } from "./ScoreCharts";
import HeatMap from "./HeatMap";
import TopPicksStrip from "./TopPicksStrip";
import StageDistribution from "./StageDistribution";

const columnColors: Record<string, string> = {
  Pipeline:           "#55555c",
  "Watch / Setup":    "#e8a045",
  "Starter Buy":      "#26a86a",
  "Add on Proof":     "#5e6ad2",
  "Trim / Exit":      "#e05252",
};

function sortCards(cards: StockCardData[], mode: SortMode): StockCardData[] {
  const sorted = [...cards];
  switch (mode) {
    case "score":
      return sorted.sort((a, b) => b.grahamScore - a.grahamScore);
    case "upside": {
      const getUpside = (c: StockCardData) =>
        c.price && c.analystTarget
          ? ((c.analystTarget - c.price) / c.price) * 100
          : -999;
      return sorted.sort((a, b) => getUpside(b) - getUpside(a));
    }
    case "conviction":
      return sorted.sort((a, b) => b.conviction - a.conviction);
    case "ticker":
      return sorted.sort((a, b) => a.ticker.localeCompare(b.ticker));
    default:
      return sorted;
  }
}

export default function GrahamBoard() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [selectedCard, setSelectedCard] = useState<StockCardData | null>(null);
  const [themeFilter, setThemeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/graham-board")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setBoard(d);
        }
      })
      .catch(() => setError("Failed to load Graham Board"));
  }, []);

  const closeModal = useCallback(() => setSelectedCard(null), []);

  if (error) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-6 text-[var(--text-muted)] text-[13px]">
        {error}
      </div>
    );
  }

  if (!board) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-6 text-[var(--text-muted)] text-[13px]">
        Loading Graham Board...
      </div>
    );
  }

  // Apply filters
  let filtered = board.cards;
  if (themeFilter) {
    filtered = filtered.filter((c) => c.theme === themeFilter);
  }
  if (statusFilter) {
    filtered = filtered.filter((c) => c.status === statusFilter);
  }

  // Sort
  const sortedCards = sortCards(filtered, sortMode);

  // Group by column
  const columns = board.columns.map((colName) => ({
    name: colName,
    cards: sortedCards.filter((c) => c.stage === colName),
  }));

  return (
    <div>
      {/*  Top 3 Picks Strip  */}
      <TopPicksStrip cards={board.cards} />

      {/*  Signal Heat Map  */}
      <HeatMap cards={board.cards} />

      {/* Commodities */}
      <CommodityBar />

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <SummaryTile
          label="Top Pick Today"
          value={board.summaryTiles.topPickToday}
          color="#26a86a"
          icon="🏆"
        />
        <SummaryTile
          label="Best Setup (Not Bought)"
          value={board.summaryTiles.bestSetupNotYetBought}
          color="#5e6ad2"
          icon="🎯"
        />
        <SummaryTile
          label="Most at Risk"
          value={board.summaryTiles.mostAtRisk}
          color="#e05252"
          icon="⚠️"
        />
        <SummaryTile
          label="Changes Today"
          value={String(board.summaryTiles.boardChangesSinceYesterday)}
          color="#e8a045"
          icon="📊"
        />
      </div>

      {/* New adds banner */}
      {board.summaryTiles.newAdds.length > 0 && (
        <div className="flex items-center gap-2 mb-5 text-[12px]">
          <span className="text-[var(--text-muted)] uppercase tracking-wider text-[10px] font-semibold">
            New adds:
          </span>
          {board.summaryTiles.newAdds.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded text-[11px] font-bold"
              style={{ background: "rgba(38,168,106,0.12)", color: "#26a86a" }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <FilterControls
        themeFilter={themeFilter}
        setThemeFilter={setThemeFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortMode={sortMode}
        setSortMode={setSortMode}
        cardCount={filtered.length}
      />

      {/* 5-column Kanban Board */}
      <div className="grid grid-cols-5 gap-3 mb-8" style={{ alignItems: "start" }}>
        {columns.map((col) => (
          <div key={col.name} className="flex flex-col gap-2">
            {/* Column header */}
            <div className="flex items-center gap-2 px-1 py-2">
              <span
                className="w-[10px] h-[10px] rounded-full flex-shrink-0"
                style={{ background: columnColors[col.name] || "#5e6ad2" }}
              />
              <span className="text-[13px] font-bold text-[var(--text-primary)]">
                {col.name}
              </span>
              <span className="text-[12px] text-[var(--text-muted)] ml-auto font-semibold">
                {col.cards.length}
              </span>
            </div>

            {/* Cards */}
            {col.cards.length > 0 ? (
              col.cards.map((card) => (
                <StockCard
                  key={card.ticker}
                  card={card}
                  onClick={() => setSelectedCard(card)}
                />
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel)] p-4 text-center text-[11px] text-[var(--text-muted)]">
                No stocks
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts row — 3 columns now */}
      <div className="grid grid-cols-3 gap-4">
        <ScoreRankingChart cards={board.cards} />
        <ScoreVsUpsideChart cards={board.cards} />
        <StageDistribution cards={board.cards} columns={board.columns} />
      </div>

      {/* Modal */}
      {selectedCard && (
        <StockModal card={selectedCard} onClose={closeModal} />
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[18px]">{icon}</span>
        <span className="text-[22px] font-black" style={{ color }}>
          {value}
        </span>
      </div>
    </div>
  );
}
