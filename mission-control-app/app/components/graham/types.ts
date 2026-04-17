export interface StockCardData {
  ticker: string;
  company: string;
  theme: string;
  stage: string;
  status: string;
  conviction: number;
  grahamScore: number;
  price?: number;
  analystTarget?: number;
  analystConsensus?: string;
  analystCount?: number;
  starterBuy: string;
  addZone: string;
  trimZone: string;
  thesisBreak: string;
  upside: string;
  downside: string;
  summary: string;
  commentary: string;
  catalysts: string[];
  riskTags: string[];
  lastUpdated: string;
}

export interface BoardData {
  boardName: string;
  columns: string[];
  cards: StockCardData[];
  summaryTiles: {
    topPickToday: string;
    bestSetupNotYetBought: string;
    mostAtRisk: string;
    boardChangesSinceYesterday: number;
    newAdds: string[];
  };
  scoring: {
    name: string;
    max: number;
  };
}

export type SortMode = "score" | "upside" | "conviction" | "ticker";
export type StatusFilter = "" | "Bullish" | "Neutral" | "Cautious";
