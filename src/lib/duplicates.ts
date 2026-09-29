import { createClient } from "@/lib/supabase/server";

export type DupCrossLink = {
  type: "cross_link";
  email: string;
  primaryContact: { id: string; email: string; full_name: string | null; company: string | null };
  altOwnerContact: { id: string; email: string; full_name: string | null; company: string | null };
};

export type DupNameCompany = {
  type: "name_company";
  key: string;
  contacts: Array<{
    id: string;
    email: string;
    full_name: string | null;
    company: string | null;
    position: string | null;
    created_at: string;
  }>;
};

export type DupReport = {
  totalContacts: number;
  crossLinks: DupCrossLink[];
  nameCompanyClusters: DupNameCompany[];
};

type ContactRow = {
  id: string;
  email: string;
  alt_emails: string[] | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  position: string | null;
  created_at: string;
};

function fullName(c: { first_name: string | null; last_name: string | null }): string | null {
  const v = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return v || null;
}

function normalizeKey(name: string | null, company: string | null): string | null {
  if (!name || !company) return null;
  return `${name.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
}

export async function getDuplicateReport(): Promise<DupReport> {
  const supabase = await createClient();

  // Supabase caps a single request at 1000 rows. Page through the whole pool
  // so duplicate detection covers every contact — not just the oldest 1000.
  const PAGE = 1000;
  const contacts: ContactRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, email, alt_emails, first_name, last_name, company, position, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("getDuplicateReport error:", error);
      if (offset === 0) {
        return { totalContacts: 0, crossLinks: [], nameCompanyClusters: [] };
      }
      break;
    }
    const batch = (data ?? []) as ContactRow[];
    contacts.push(...batch);
    if (batch.length < PAGE) break;
  }

  // === Cross-link detection ===
  // For every contact A's alt_email that equals contact B's primary email,
  // emit a row.
  const primaryById = new Map<string, ContactRow>();
  const primaryByEmail = new Map<string, ContactRow>();
  for (const c of contacts) {
    primaryById.set(c.id, c);
    primaryByEmail.set(c.email.toLowerCase(), c);
  }

  const crossLinks: DupCrossLink[] = [];
  for (const altOwner of contacts) {
    for (const alt of altOwner.alt_emails ?? []) {
      const lower = alt.toLowerCase();
      const primaryOwner = primaryByEmail.get(lower);
      if (primaryOwner && primaryOwner.id !== altOwner.id) {
        crossLinks.push({
          type: "cross_link",
          email: lower,
          primaryContact: {
            id: primaryOwner.id,
            email: primaryOwner.email,
            full_name: fullName(primaryOwner),
            company: primaryOwner.company,
          },
          altOwnerContact: {
            id: altOwner.id,
            email: altOwner.email,
            full_name: fullName(altOwner),
            company: altOwner.company,
          },
        });
      }
    }
  }

  // === Name+company clustering ===
  const groups = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const fn = fullName(c);
    const key = normalizeKey(fn, c.company);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const nameCompanyClusters: DupNameCompany[] = [];
  for (const [key, arr] of groups.entries()) {
    if (arr.length < 2) continue;
    nameCompanyClusters.push({
      type: "name_company",
      key,
      contacts: arr.map((c) => ({
        id: c.id,
        email: c.email,
        full_name: fullName(c),
        company: c.company,
        position: c.position,
        created_at: c.created_at,
      })),
    });
  }

  // Sort biggest clusters first
  nameCompanyClusters.sort((a, b) => b.contacts.length - a.contacts.length);

  return {
    totalContacts: contacts.length,
    crossLinks,
    nameCompanyClusters,
  };
}
