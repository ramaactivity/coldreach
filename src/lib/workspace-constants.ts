// Client-safe types and constants. No server imports.

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
  default_signature: string | null;
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
