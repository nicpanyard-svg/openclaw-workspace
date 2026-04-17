"use client";

import { useState } from "react";
import type { CalendarEvent } from "../types";

export default function EventBlock({
  event,
  columnIndex,
  columnCount,
}: {
  event: CalendarEvent;
  columnIndex: number;
  columnCount: number;
}) {
  const [hovered, setHovered] = useState(false);

  const HOUR_HEIGHT = 60;
  const START_HOUR = 7;
  const top = (event.startHour - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(event.durationHours * HOUR_HEIGHT, 20);

  const widthPct = 100 / columnCount;
  const leftPct = columnIndex * widthPct;

  const startLabel = formatTime(event.startHour);
  const endLabel = formatTime(event.startHour + event.durationHours);

  return (
    <div
      className="absolute rounded-[3px] px-1.5 py-1 text-[11px] font-medium overflow-hidden cursor-default z-10"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `${leftPct + 1}%`,
        width: `${widthPct - 2}%`,
        backgroundColor: event.color + "22",
        color: event.color,
        borderLeft: `2px solid ${event.color}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="truncate font-semibold leading-tight">{event.title}</div>
      {height > 28 && (
        <div className="truncate opacity-60 text-[9px] mt-0.5">
          {startLabel} – {endLabel}
        </div>
      )}
      {hovered && (
        <div className="absolute z-50 left-full ml-2 top-0 w-48 p-3 rounded-[6px] bg-[#1c1c1f] border border-[#2a2a2d] shadow-xl pointer-events-none">
          <p className="font-semibold text-[12px] mb-1" style={{ color: event.color }}>
            {event.title}
          </p>
          <p className="text-[#8b8b91] text-[11px] mb-1">
            {event.agent} · {startLabel} – {endLabel}
          </p>
          <p className="text-[#55555c] text-[11px]">{event.description}</p>
        </div>
      )}
    </div>
  );
}

function formatTime(h: number): string {
  const hour = Math.floor(h);
  const mins = h % 1 === 0.5 ? "30" : "00";
  const ampm = hour >= 12 ? "pm" : "am";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${mins}${ampm}`;
}
