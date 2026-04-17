export interface Agent {
  name: string;
  role: string;
  color: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  status: "ACTIVE" | "IDLE" | "WARN" | "DOWN";
  currentTask: string;
  nextAction: string;
  tags: string[];
}

export interface PriorityItem {
  id: number;
  label: string;
  urgent: boolean;
}

export interface WorkItem {
  id: number;
  label: string;
  agent: string;
}

export interface HealthSignal {
  name: string;
  status: "ok" | "warn" | "down";
}

export interface CalendarEvent {
  agent: string;
  day: number; // 0=Mon, 6=Sun
  startHour: number;
  durationHours: number;
  title: string;
  description: string;
  color: string;
}

export interface Tool {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: "online" | "offline" | "beta";
  url?: string;
  type: "builtin" | "custom";
}

export interface TargetAccount {
  name: string;
  vertical: string;
  offerFit: string[];
  status: "Active" | "Warm" | "Cold";
  lastTouch: string;
}

export interface Offer {
  name: string;
  category: string;
  description: string;
}
