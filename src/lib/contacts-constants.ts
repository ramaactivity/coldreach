// Client-safe types and constants for contacts. No server imports.

export type ContactsSort =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "company_asc"
  | "last_contacted_desc"
  | "last_contacted_asc";

export const CONTACTS_SORT_OPTIONS: { value: ContactsSort; label: string }[] = [
  { value: "created_desc", label: "Terbaru ditambah" },
  { value: "created_asc", label: "Tertua ditambah" },
  { value: "name_asc", label: "Nama A → Z" },
  { value: "name_desc", label: "Nama Z → A" },
  { value: "company_asc", label: "Company A → Z" },
  { value: "last_contacted_desc", label: "Last contacted (terbaru)" },
  { value: "last_contacted_asc", label: "Last contacted (terlama / belum)" },
];
