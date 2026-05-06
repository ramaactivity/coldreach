// Client-safe types and constants for the import flow.
// Lives outside import-actions.ts because Next.js "use server" files
// may only export async functions.

export type SkippedReason =
  | "missing_email"
  | "invalid_email"
  | "duplicate_in_csv"
  | "duplicate_primary"
  | "duplicate_alt";

export const SKIPPED_REASON_LABEL: Record<SkippedReason, string> = {
  missing_email: "Email kosong",
  invalid_email: "Format email invalid",
  duplicate_in_csv: "Duplikat di CSV ini",
  duplicate_primary: "Sudah ada di database (primary)",
  duplicate_alt: "Sudah ada sebagai alt email kontak lain",
};

export type SkippedDetail = {
  rowIndex: number;
  email: string;
  reason: SkippedReason;
};

export type ImportRow = {
  email?: string;
  alt_emails?: string[];
  first_name?: string;
  last_name?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  notes?: string;
  tags?: string;
};

export type ImportRowWithIndex = ImportRow & { rowIndex: number };

export type AnalysisRow = {
  rowIndex: number;
  email?: string;
  alt_emails?: string[];
};

export type AnalysisResult = {
  totalRows: number;
  willImport: number;
  skipped: SkippedDetail[];
};

export type ChunkResult = {
  imported: number;
  skipped: SkippedDetail[];
  failed: number;
  errors: string[];
};
