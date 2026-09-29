export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // Fully non-Latin input (e.g. CJK/Arabic names) reduces to "" — fall back to
  // a stable default so callers never get an empty route segment.
  return slug || "workspace";
}
