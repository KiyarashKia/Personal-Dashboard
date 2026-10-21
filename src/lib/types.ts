export type ISODate = string;
export type Mode = "day" | "week" | "month" | "year";
export type Domain = "learning" | "health" | "career" | "admin";
export type Skill =
  "grammar" | "listening" | "speaking" | "reading" | "writing";
export interface Activity {
  id: string;
  date: ISODate;
  habit: string;
  category: string;
  domain: Domain | null;
  skill: Skill | null;
  completed: boolean;
  sheet: string;
  cell: string;
}
export interface SheetRange {
  range: string;
  values: unknown[][];
}
export interface Dataset {
  activities: Activity[];
  tabs: string[];
  warnings: string[];
  source: "google-api" | "google-public";
  fetchedAt: string;
  today: ISODate;
  timezone: string;
  sheetId: string;
  refreshSeconds: number;
  syncMode: "poll" | "webhook";
}
export interface DataResponse {
  data: Dataset;
  stale: boolean;
  error?: string;
}
export interface Rate {
  completed: number;
  scheduled: number;
  rate: number | null;
}
export interface DateRange {
  start: ISODate;
  end: ISODate;
}
export type Weights = Record<Domain, number>;
export const DEFAULT_WEIGHTS: Weights = {
  health: 35,
  learning: 30,
  career: 25,
  admin: 10,
};
export const DOMAIN_NAMES: Record<Domain, string> = {
  health: "Health",
  learning: "French",
  career: "Career",
  admin: "Life admin",
};
