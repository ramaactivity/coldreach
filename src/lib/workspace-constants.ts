// Client-safe types and constants. No server imports.

import type { SignatureData } from "@/lib/signature";

export type PipelineStage = {
  id: string;
  name: string;
  color: string;
  order: number;
  is_default?: boolean;
  is_terminal?: boolean;
};

export type CustomFieldType = "text" | "number" | "date" | "select" | "textarea";

export type CustomField = {
  id: string; // stable key in contacts.custom_fields JSONB
  label: string;
  type: CustomFieldType;
  options?: string[]; // for select
  required?: boolean;
  hint?: string;
};

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select (dropdown)" },
];

export type Workspace = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  color_theme: string;
  business_type: string | null;
  pipeline_stages: PipelineStage[];
  custom_fields_schema: CustomField[];
  schedule_days: number[];
  schedule_start_time: string;
  schedule_end_time: string;
  daily_target: number;
  /** Structured signature (logo, contacts, socials). NULL = no signature. */
  signature_data: SignatureData | null;
  /** @deprecated legacy column, no longer read or written. Kept until 0022 drops it. */
  default_signature_html: string | null;
  display_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export const BUSINESS_TYPES = [
  { value: "catering", label: "Catering", emoji: "🍱" },
  { value: "photography", label: "Photography / Photobooth", emoji: "📸" },
  { value: "design", label: "Design / Creative Service", emoji: "🎨" },
  { value: "consulting", label: "Consulting", emoji: "💼" },
  { value: "other", label: "Lainnya", emoji: "🏢" },
] as const;

export const COLOR_THEMES = [
  { value: "#f59e0b", label: "Orange" },
  { value: "#ec4899", label: "Pink" },
  { value: "#a855f7", label: "Purple" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#10b981", label: "Green" },
  { value: "#f43f5e", label: "Red" },
  { value: "#71717a", label: "Gray" },
] as const;

/**
 * Workspace accent presets (design system). The 8 named presets are AA-safe
 * (white text passes contrast on the solid) and are themeable identity only —
 * never the action color. Keys match the CSS `[data-accent="…"]` presets in
 * globals.css 1:1.
 */
export type AccentTheme =
  | "orange"
  | "pink"
  | "purple"
  | "blue"
  | "cyan"
  | "green"
  | "red"
  | "gray";

/**
 * Maps a stored `workspace.color_theme` hex (the COLOR_THEMES picker values) to
 * its named accent preset. Frontend-only — the DB still stores the hex (zod
 * schema unchanged). The rendered accent is the AA-safe preset, NOT the literal
 * hex, so e.g. amber `#f59e0b` renders as the `orange` preset (`#ea580c`).
 */
export const HEX_TO_ACCENT: Record<string, AccentTheme> = {
  "#f59e0b": "orange",
  "#ec4899": "pink",
  "#a855f7": "purple",
  "#3b82f6": "blue",
  "#06b6d4": "cyan",
  "#10b981": "green",
  "#f43f5e": "red",
  "#71717a": "gray",
};

/** Resolve a workspace's stored color_theme to a `data-accent` preset name. */
export function accentFromColorTheme(
  colorTheme: string | null | undefined,
): AccentTheme {
  if (!colorTheme) return "orange";
  return HEX_TO_ACCENT[colorTheme.toLowerCase()] ?? "orange";
}

/** The AA-safe solid hex a given accent preset actually renders as (for the swatch picker). */
export const ACCENT_PRESET_HEX: Record<AccentTheme, string> = {
  orange: "#ea580c",
  pink: "#db2777",
  purple: "#9333ea",
  blue: "#2563eb",
  cyan: "#0d9488",
  green: "#16a34a",
  red: "#dc2626",
  gray: "#475569",
};

/**
 * Default schedule per business type (Tiska=morning, Photobooth=lunch,
 * Visual=afternoon).
 */
export function getDefaultScheduleForBusinessType(type: string): {
  schedule_start_time: string;
  schedule_end_time: string;
  daily_target: number;
} {
  switch (type) {
    case "catering":
      return {
        schedule_start_time: "09:00:00",
        schedule_end_time: "11:00:00",
        daily_target: 30,
      };
    case "photography":
      return {
        schedule_start_time: "12:00:00",
        schedule_end_time: "14:00:00",
        daily_target: 20,
      };
    case "design":
      return {
        schedule_start_time: "15:00:00",
        schedule_end_time: "17:00:00",
        daily_target: 5,
      };
    default:
      return {
        schedule_start_time: "09:00:00",
        schedule_end_time: "17:00:00",
        daily_target: 30,
      };
  }
}

export function getDefaultPipelineForBusinessType(
  type: string,
): PipelineStage[] {
  switch (type) {
    case "catering":
      return [
        { id: "new", name: "Baru", color: "#94a3b8", order: 1, is_default: true },
        { id: "contacted", name: "Sudah Dikontak", color: "#3b82f6", order: 2 },
        { id: "interested-tasting", name: "Tertarik Food Tasting", color: "#f59e0b", order: 3 },
        { id: "tasting-scheduled", name: "Tasting Terjadwal", color: "#a855f7", order: 4 },
        { id: "tasting-done", name: "Tasting Selesai", color: "#06b6d4", order: 5 },
        { id: "quote-sent", name: "Quote Dikirim", color: "#0ea5e9", order: 6 },
        { id: "won", name: "Closed - Won", color: "#22c55e", order: 7, is_terminal: true },
        { id: "lost", name: "Closed - Lost", color: "#ef4444", order: 8, is_terminal: true },
      ];
    case "photography":
      return [
        { id: "new", name: "Baru", color: "#94a3b8", order: 1, is_default: true },
        { id: "contacted", name: "Sudah Dikontak", color: "#3b82f6", order: 2 },
        { id: "asked-pricelist", name: "Tanya Pricelist", color: "#f59e0b", order: 3 },
        { id: "quote-sent", name: "Quote Dikirim", color: "#0ea5e9", order: 4 },
        { id: "asked-availability", name: "Tanya Tersedia", color: "#a855f7", order: 5 },
        { id: "contract-sent", name: "Kontrak Dikirim", color: "#06b6d4", order: 6 },
        { id: "booked", name: "Booked", color: "#22c55e", order: 7, is_terminal: true },
        { id: "lost", name: "Lost", color: "#ef4444", order: 8, is_terminal: true },
      ];
    case "design":
      return [
        { id: "new", name: "Baru", color: "#94a3b8", order: 1, is_default: true },
        { id: "contacted", name: "Sudah Dikontak", color: "#3b82f6", order: 2 },
        { id: "asked-portfolio", name: "Tanya Portfolio", color: "#f59e0b", order: 3 },
        { id: "brief-received", name: "Brief Diterima", color: "#a855f7", order: 4 },
        { id: "quote-sent", name: "Quote Dikirim", color: "#0ea5e9", order: 5 },
        { id: "won", name: "Closed - Won", color: "#22c55e", order: 6, is_terminal: true },
        { id: "lost", name: "Closed - Lost", color: "#ef4444", order: 7, is_terminal: true },
      ];
    default:
      return [
        { id: "new", name: "Baru", color: "#94a3b8", order: 1, is_default: true },
        { id: "contacted", name: "Sudah Dikontak", color: "#3b82f6", order: 2 },
        { id: "interested", name: "Tertarik", color: "#f59e0b", order: 3 },
        { id: "won", name: "Closed - Won", color: "#22c55e", order: 4, is_terminal: true },
        { id: "lost", name: "Closed - Lost", color: "#ef4444", order: 5, is_terminal: true },
      ];
  }
}
