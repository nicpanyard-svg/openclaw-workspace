import { readFileSync } from "fs";
import { join } from "path";

type BoardStatus = "Backlog" | "In Progress" | "Review" | "Done" | "Reopened" | "Blocked";
type OwnerColor = "violet" | "sky" | "amber";

interface RapidQuoteOwner {
  id: string;
  name: string;
  role: string;
  color: OwnerColor;
}

interface RapidQuoteCard {
  id: string;
  title: string;
  status: BoardStatus;
  ownerIds: string[];
  priority: string;
  summary: string;
  nextStep: string;
  notes: string[];
  sourceRefs?: string[];
}

interface RapidQuoteLane {
  id: string;
  title: string;
  description: string;
  focus: string;
  cards: RapidQuoteCard[];
}

interface RapidQuoteBoardData {
  project: {
    id: string;
    name: string;
    subtitle: string;
    owner: string;
    updatedAt: string;
    summary: string;
    sourceNotes: string[];
    rules: string[];
  };
  owners: RapidQuoteOwner[];
  statuses: BoardStatus[];
  lanes: RapidQuoteLane[];
}

const DATA_PATH = join(process.cwd(), "data", "rapidquote-board.json");

const STATUS_STYLES: Record<BoardStatus, { tone: string; dot: string; border: string }> = {
  Backlog: { tone: "text-[#8b8b91] bg-[#8b8b91]/10", dot: "bg-[#8b8b91]", border: "border-[#3a3a3d]" },
  "In Progress": { tone: "text-[#7c8cff] bg-[#5e6ad2]/15", dot: "bg-[#5e6ad2]", border: "border-[#5e6ad2]/30" },
  Review: { tone: "text-[#52b3ff] bg-[#1f6feb]/15", dot: "bg-[#52b3ff]", border: "border-[#1f6feb]/30" },
  Done: { tone: "text-[#2fc27a] bg-[#26a86a]/15", dot: "bg-[#26a86a]", border: "border-[#26a86a]/30" },
  Reopened: { tone: "text-[#ff8a5b] bg-[#ff8a5b]/15", dot: "bg-[#ff8a5b]", border: "border-[#ff8a5b]/35" },
  Blocked: { tone: "text-[#ff6b6b] bg-[#e05252]/15", dot: "bg-[#e05252]", border: "border-[#e05252]/35" },
};

const OWNER_STYLES: Record<OwnerColor, string> = {
  violet: "bg-[#a855f7]/15 text-[#d8b4fe] border-[#a855f7]/30",
  sky: "bg-[#0ea5e9]/15 text-[#7dd3fc] border-[#0ea5e9]/30",
  amber: "bg-[#f59e0b]/15 text-[#fcd34d] border-[#f59e0b]/30",
};

function loadBoard(): RapidQuoteBoardData {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as RapidQuoteBoardData;
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RapidQuotePage() {
  const board = loadBoard();
  const ownerMap = new Map(board.owners.map((owner) => [owner.id, owner]));

  const statusCounts = board.statuses.map((status) => ({
    status,
    count: board.lanes.reduce(
      (sum, lane) => sum + lane.cards.filter((card) => card.status === status).length,
      0,
    ),
  }));

  const totalCards = board.lanes.reduce((sum, lane) => sum + lane.cards.length, 0);
  const reopenedCards = board.lanes.flatMap((lane) => lane.cards).filter((card) => card.status === "Reopened").length;
  const blockedCards = board.lanes.flatMap((lane) => lane.cards).filter((card) => card.status === "Blocked").length;

  return (
    <div className="min-h-screen bg-[#0f0f10] text-[#e8e8ea]">
      <div className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#6d6d75]">
              <span className="rounded-full border border-[#2a2a2d] px-2.5 py-1">Project board</span>
              <span className="rounded-full border border-[#2a2a2d] px-2.5 py-1">Owner · {board.project.owner}</span>
              <span className="rounded-full border border-[#2a2a2d] px-2.5 py-1">Updated {formatDate(board.project.updatedAt)}</span>
            </div>
            <h1 className="text-[28px] font-semibold tracking-tight text-white">{board.project.name}</h1>
            <p className="mt-2 max-w-[900px] text-[14px] leading-6 text-[#9b9ba3]">{board.project.summary}</p>
            <p className="mt-2 text-[13px] text-[#6d6d75]">{board.project.subtitle}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Workstreams" value={String(board.lanes.length)} hint="Main lanes" />
            <MetricCard label="Cards" value={String(totalCards)} hint="Seeded items" />
            <MetricCard label="Reopened" value={String(reopenedCards)} hint="Visible, not buried" accent="reopened" />
            <MetricCard label="Blocked" value={String(blockedCards)} hint="Needs decision or dependency" accent="blocked" />
          </div>
        </div>

        <div className="mb-6 grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <section className="rounded-[14px] border border-[#2a2a2d] bg-[#141416] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-white">Status view</h2>
                <p className="mt-1 text-[12px] text-[#7f7f87]">Quick read across backlog, live work, review, done, reopened, and blocked.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {statusCounts.map(({ status, count }) => {
                const style = STATUS_STYLES[status];
                return (
                  <div key={status} className={`rounded-[12px] border p-4 ${style.border} bg-[#18181b]`}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${style.tone}`}>{status}</span>
                    </div>
                    <div className="mt-4 text-[28px] font-semibold text-white">{count}</div>
                    <div className="mt-1 text-[12px] text-[#72727a]">cards in this state</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[14px] border border-[#2a2a2d] bg-[#141416] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <h2 className="text-[15px] font-semibold text-white">Owners + rules</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {board.owners.map((owner) => (
                <div key={owner.id} className={`rounded-full border px-3 py-2 text-[12px] font-medium ${OWNER_STYLES[owner.color]}`}>
                  {owner.name} <span className="ml-1 text-[11px] opacity-75">{owner.role}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d6d75]">Seed source</div>
                <div className="space-y-2">
                  {board.project.sourceNotes.map((note) => (
                    <p key={note} className="rounded-[10px] border border-[#26262a] bg-[#17171a] px-3 py-2 text-[12px] leading-5 text-[#a1a1aa]">{note}</p>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d6d75]">Guardrails</div>
                <div className="space-y-2">
                  {board.project.rules.map((rule) => (
                    <p key={rule} className="rounded-[10px] border border-[#26262a] bg-[#17171a] px-3 py-2 text-[12px] leading-5 text-[#a1a1aa]">{rule}</p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold text-white">RapidQuote workstreams</h2>
              <p className="mt-1 text-[12px] text-[#7f7f87]">Each lane keeps owner, status, next step, and reopened context visible in one place.</p>
            </div>
          </div>

          <div className="grid gap-5 2xl:grid-cols-2">
            {board.lanes.map((lane) => (
              <div key={lane.id} className="rounded-[16px] border border-[#2a2a2d] bg-[#141416] p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d6d75]">Lane</div>
                    <h3 className="mt-1 text-[18px] font-semibold text-white">{lane.title}</h3>
                    <p className="mt-2 text-[13px] leading-5 text-[#9b9ba3]">{lane.description}</p>
                  </div>
                  <div className="rounded-[10px] border border-[#2b2b30] bg-[#19191d] px-3 py-2 text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[#66666e]">Focus</div>
                    <div className="mt-1 max-w-[210px] text-[12px] leading-5 text-[#d2d2d8]">{lane.focus}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {lane.cards.map((card) => {
                    const style = STATUS_STYLES[card.status];
                    return (
                      <article key={card.id} className={`rounded-[14px] border p-4 ${style.border} bg-[#18181b]`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${style.tone}`}>{card.status}</span>
                              <span className="rounded-full border border-[#303036] bg-[#1f1f23] px-2 py-1 text-[11px] font-semibold text-[#b4b4bc]">{card.priority}</span>
                            </div>
                            <h4 className="text-[15px] font-semibold text-white">{card.title}</h4>
                            <p className="mt-2 text-[13px] leading-6 text-[#b3b3ba]">{card.summary}</p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            {card.ownerIds.map((ownerId) => {
                              const owner = ownerMap.get(ownerId);
                              if (!owner) return null;
                              return (
                                <span key={owner.id} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${OWNER_STYLES[owner.color]}`}>
                                  {owner.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                          <div className="rounded-[12px] border border-[#28282d] bg-[#151519] p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#66666e]">Next step</div>
                            <p className="mt-2 text-[13px] leading-5 text-[#e1e1e6]">{card.nextStep}</p>
                          </div>
                          <div className="rounded-[12px] border border-[#28282d] bg-[#151519] p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#66666e]">Notes</div>
                            <ul className="mt-2 space-y-2">
                              {card.notes.map((note) => (
                                <li key={note} className="flex gap-2 text-[12px] leading-5 text-[#9f9fa7]">
                                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#5e6ad2]" />
                                  <span>{note}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {card.sourceRefs && card.sourceRefs.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {card.sourceRefs.map((ref) => (
                              <span key={ref} className="rounded-full border border-[#303036] bg-[#16161a] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#73737b]">
                                {ref}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "reopened" | "blocked";
}) {
  const accentClasses = accent === "reopened"
    ? "border-[#ff8a5b]/35 bg-[#ff8a5b]/10"
    : accent === "blocked"
      ? "border-[#e05252]/35 bg-[#e05252]/10"
      : "border-[#2a2a2d] bg-[#141416]";

  return (
    <div className={`rounded-[14px] border p-4 ${accentClasses}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#72727a]">{label}</div>
      <div className="mt-2 text-[26px] font-semibold text-white">{value}</div>
      <div className="mt-1 text-[12px] text-[#888890]">{hint}</div>
    </div>
  );
}
