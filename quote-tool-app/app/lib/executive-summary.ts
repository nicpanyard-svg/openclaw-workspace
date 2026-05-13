import type { QuoteStructuredTextBlock, QuoteTextBlock } from "@/app/lib/quote-record";

const bulletPattern = /^(?:\u2022|-|\*)\s+/;
const numberedPattern = /^\s*\d+[.)]\s+/;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeLineArray(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeText(value).trim()).filter(Boolean);
}

function normalizeBlockType(value: unknown): QuoteStructuredTextBlock["type"] {
  switch (value) {
    case "heading":
    case "paragraph":
    case "bullet_list":
    case "numbered_list":
      return value;
    default:
      return "paragraph";
  }
}

function blockId(index: number) {
  return `summary-block-${index + 1}`;
}

function looksLikeHeadingChunk(chunk: string, lines: string[]) {
  if (lines.length !== 1) return false;
  const trimmed = chunk.trim();
  if (!trimmed) return false;
  if (trimmed.length > 90) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 10;
}

export type ExecutiveSummaryRenderBlock = QuoteStructuredTextBlock;

export function createExecutiveSummaryBlock(
  type: QuoteStructuredTextBlock["type"],
  index = 0,
): QuoteStructuredTextBlock {
  if (type === "bullet_list" || type === "numbered_list") {
    return { id: blockId(index), type, items: [""] };
  }

  return {
    id: blockId(index),
    type,
    text: "",
  };
}

function parseLegacyExecutiveSummaryBody(body: string) {
  const normalizedBody = normalizeText(body).replace(/\r\n/g, "\n").trim();
  if (!normalizedBody) return [] as QuoteStructuredTextBlock[];

  return normalizedBody
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length > 0 && lines.every((line) => bulletPattern.test(line))) {
        return {
          id: blockId(index),
          type: "bullet_list" as const,
          items: lines.map((line) => line.replace(bulletPattern, "").trim()).filter(Boolean),
        };
      }

      if (lines.length > 0 && lines.every((line) => numberedPattern.test(line))) {
        return {
          id: blockId(index),
          type: "numbered_list" as const,
          items: lines.map((line) => line.replace(numberedPattern, "").trim()).filter(Boolean),
        };
      }

      if (looksLikeHeadingChunk(chunk, lines)) {
        return {
          id: blockId(index),
          type: "heading" as const,
          text: chunk,
        };
      }

      return {
        id: blockId(index),
        type: "paragraph" as const,
        text: chunk,
      };
    });
}

export function normalizeExecutiveSummaryBlocks(summary: QuoteTextBlock): QuoteStructuredTextBlock[] {
  const explicitBlocks = Array.isArray(summary.blocks) ? summary.blocks : [];
  if (explicitBlocks.length > 0) {
    return explicitBlocks.map((block, index) => {
      const type = normalizeBlockType(block?.type);
      const explicitItems = Array.isArray(block?.items) ? block.items.map((item) => normalizeText(item)) : [];
      return {
        id: normalizeText(block?.id) || blockId(index),
        type,
        text: type === "heading" || type === "paragraph" ? normalizeText(block?.text) : undefined,
        items: type === "bullet_list" || type === "numbered_list"
          ? (explicitItems.length ? explicitItems : [""])
          : undefined,
      };
    });
  }

  return parseLegacyExecutiveSummaryBody(summary.body ?? "");
}

export function serializeExecutiveSummaryBlocks(blocks: QuoteStructuredTextBlock[]) {
  const normalizedBlocks = blocks.map((block, index) => {
    const type = normalizeBlockType(block.type);
    return {
      id: normalizeText(block.id) || blockId(index),
      type,
      text: type === "heading" || type === "paragraph" ? normalizeText(block.text) : undefined,
      items: type === "bullet_list" || type === "numbered_list"
        ? normalizeLineArray(block.items)
        : undefined,
    } satisfies QuoteStructuredTextBlock;
  }).filter((block) => {
    if (block.type === "heading" || block.type === "paragraph") {
      return Boolean(block.text?.trim());
    }

    return Boolean(block.items?.length);
  });

  const body = normalizedBlocks
    .map((block) => {
      if (block.type === "heading" || block.type === "paragraph") {
        return block.text?.trim() ?? "";
      }

      const prefix = block.type === "bullet_list" ? "- " : "";
      return (block.items ?? []).map((item, index) => (
        block.type === "numbered_list"
          ? `${index + 1}. ${item}`
          : `${prefix}${item}`
      )).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const paragraphs = normalizedBlocks.flatMap((block) => {
    if (block.type === "heading" || block.type === "paragraph") {
      return block.text?.trim() ? [block.text.trim()] : [];
    }

    return (block.items ?? []).map((item, index) => (
      block.type === "numbered_list"
        ? `${index + 1}. ${item}`
        : `- ${item}`
    ));
  });

  return {
    blocks: normalizedBlocks,
    body,
    paragraphs,
  };
}

export function buildExecutiveSummaryRenderBlocks(summary: QuoteTextBlock): ExecutiveSummaryRenderBlock[] {
  const blocks = serializeExecutiveSummaryBlocks(normalizeExecutiveSummaryBlocks(summary)).blocks;
  const customerContext = normalizeText(summary.customerContext).trim();

  return [
    ...(customerContext ? [{
      id: "summary-customer-context",
      type: "paragraph" as const,
      text: customerContext,
    }] : []),
    ...blocks,
  ];
}

export function buildExecutiveSummaryWorkbookText(summary: QuoteTextBlock) {
  return buildExecutiveSummaryRenderBlocks(summary)
    .map((block) => {
      if (block.type === "heading" || block.type === "paragraph") {
        return block.text?.trim() ?? "";
      }

      return (block.items ?? []).map((item, index) => (
        block.type === "numbered_list"
          ? `${index + 1}. ${item}`
          : `- ${item}`
      )).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export function hasExecutiveSummaryStructuredContent(summary: QuoteTextBlock) {
  if (normalizeText(summary.customerContext).trim().length > 0) return true;
  if (normalizeText(summary.body).trim().length > 0) return true;
  if ((summary.paragraphs ?? []).some((entry) => normalizeText(entry).trim().length > 0)) return true;

  return serializeExecutiveSummaryBlocks(normalizeExecutiveSummaryBlocks(summary)).blocks.some((block) => {
    if (block.type === "heading" || block.type === "paragraph") {
      return Boolean(block.text?.trim());
    }

    return Boolean(block.items?.length);
  });
}
