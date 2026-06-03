// Apollo.io API client — People Search (free) + Bulk People Enrichment (paid).
//
// Auth: X-Api-Key header (never URL params — Apollo is deprecating that).
// Search (mixed_people/api_search) costs 0 credits and returns candidates with
// LOCKED emails. Bulk match (people/bulk_match) reveals the work email and
// costs ~1 credit per record (max 10 records/call). We never set
// reveal_personal_emails — work email only, cheaper and right for B2B.

const BASE = "https://api.apollo.io/api/v1";

function getApolloKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY env var missing");
  return key;
}

async function apolloPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": getApolloKey(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Apollo menolak request (401/403). Cek APOLLO_API_KEY & akses endpoint-nya.",
      );
    }
    if (res.status === 429) {
      throw new Error("Apollo rate limit (429). Coba lagi sebentar.");
    }
    throw new Error(`Apollo API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export type ApolloPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null; // obfuscated in search; full name only after reveal
  name: string | null;
  title: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization_name: string | null;
  organization_website: string | null;
  organization_industry: string | null;
  has_email: boolean; // Apollo HAS an email on file (reveal likely to succeed)
};

export type ApolloSearchCriteria = {
  titles?: string[];
  locations?: string[]; // person locations, e.g. ["Jakarta, Indonesia"]
  keywords?: string; // free-text (industry / company keyword)
  employeeRanges?: string[]; // e.g. ["1,10","11,50"]
  perPage?: number; // default 25, max 100
  // Default true → only "Net New" (not already saved by your Apollo team),
  // which excludes people you likely already exported to ColdReach and saves
  // reveal credits. Set false to also include already-saved people.
  netNewOnly?: boolean;
};

export type ApolloSearchResult = {
  people: ApolloPerson[];
  page: number;
  totalPages: number;
  totalEntries: number;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function normalizePerson(raw: Record<string, unknown>): ApolloPerson | null {
  const id = str(raw.id);
  if (!id) return null;
  const org = (raw.organization ?? raw.account ?? null) as Record<
    string,
    unknown
  > | null;
  // api_search obfuscates the last name and omits email/location/website —
  // those only come back on reveal (bulk_match).
  const lastName = str(raw.last_name) ?? str(raw.last_name_obfuscated);
  const first = str(raw.first_name);
  return {
    id,
    first_name: first,
    last_name: lastName,
    name: str(raw.name) ?? ([first, lastName].filter(Boolean).join(" ") || null),
    title: str(raw.title),
    linkedin_url: str(raw.linkedin_url),
    city: str(raw.city),
    state: str(raw.state),
    country: str(raw.country),
    organization_name: org ? str(org.name) : null,
    organization_website: org
      ? str(org.website_url) ?? str(org.primary_domain)
      : null,
    organization_industry: org ? str(org.industry) : null,
    has_email: raw.has_email === true,
  };
}

/** People Search — 0 credits, emails LOCKED. */
export async function apolloSearchPeople(
  criteria: ApolloSearchCriteria,
  page: number = 1,
): Promise<ApolloSearchResult> {
  const body: Record<string, unknown> = {
    page: Math.max(1, page),
    per_page: Math.min(100, Math.max(1, criteria.perPage ?? 25)),
  };
  if (criteria.titles?.length) body.person_titles = criteria.titles;
  if (criteria.locations?.length) body.person_locations = criteria.locations;
  if (criteria.keywords?.trim()) body.q_keywords = criteria.keywords.trim();
  if (criteria.employeeRanges?.length)
    body.organization_num_employees_ranges = criteria.employeeRanges;
  // Net New only (exclude people already saved/prospected by your team).
  if (criteria.netNewOnly !== false) body.prospected_by_current_team = ["no"];

  const data = (await apolloPost("/mixed_people/api_search", body)) as Record<
    string,
    unknown
  >;
  const peopleRaw = Array.isArray(data.people)
    ? (data.people as Array<Record<string, unknown>>)
    : [];
  // api_search returns total_entries at the top level (no pagination object).
  const perPage = (body.per_page as number) || 25;
  const totalEntries =
    typeof data.total_entries === "number"
      ? data.total_entries
      : peopleRaw.length;
  // Apollo caps api_search paging (≈ 50k records); keep totalPages sane.
  const totalPages = Math.min(
    500,
    Math.max(1, Math.ceil(totalEntries / perPage)),
  );
  return {
    people: peopleRaw.map(normalizePerson).filter((p): p is ApolloPerson => !!p),
    page: Math.max(1, page),
    totalPages,
    totalEntries,
  };
}

export type ApolloMatch = {
  id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  title: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization_name: string | null;
  organization_website: string | null;
};

// Apollo returns a locked placeholder when an email can't be revealed.
function realEmail(v: unknown): string | null {
  const e = str(v);
  if (!e) return null;
  if (e.includes("email_not_unlocked") || e.includes("domain.com")) return null;
  return e.toLowerCase();
}

function normalizeMatch(raw: Record<string, unknown>): ApolloMatch {
  const org = (raw.organization ?? raw.account ?? null) as Record<
    string,
    unknown
  > | null;
  return {
    id: str(raw.id),
    email: realEmail(raw.email),
    first_name: str(raw.first_name),
    last_name: str(raw.last_name),
    name: str(raw.name),
    title: str(raw.title),
    linkedin_url: str(raw.linkedin_url),
    city: str(raw.city),
    state: str(raw.state),
    country: str(raw.country),
    organization_name: org ? str(org.name) : null,
    organization_website: org
      ? str(org.website_url) ?? str(org.primary_domain)
      : null,
  };
}

/**
 * Bulk reveal — ~1 credit per record, max 10/call. Auto-chunks. Returns
 * matches keyed in input order; email is null when Apollo couldn't reveal it.
 */
export async function apolloBulkMatch(ids: string[]): Promise<ApolloMatch[]> {
  const out: ApolloMatch[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const data = (await apolloPost("/people/bulk_match", {
      reveal_personal_emails: false,
      details: chunk.map((id) => ({ id })),
    })) as Record<string, unknown>;
    const matchesRaw = Array.isArray(data.matches)
      ? (data.matches as Array<Record<string, unknown> | null>)
      : [];
    for (const m of matchesRaw) {
      if (m && typeof m === "object") out.push(normalizeMatch(m));
    }
  }
  return out;
}
