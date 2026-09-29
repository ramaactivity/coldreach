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
  // Explicit prospected scope, overrides netNewOnly. Used for the count tiles.
  prospected?: "net_new" | "saved" | "all";
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
  // Prospected scope. Explicit `prospected` wins (used by count tiles); else
  // fall back to the Net New toggle (default net-new only).
  if (criteria.prospected === "net_new") body.prospected_by_current_team = ["no"];
  else if (criteria.prospected === "saved")
    body.prospected_by_current_team = ["yes"];
  else if (criteria.prospected === "all") {
    /* no filter */
  } else if (criteria.netNewOnly !== false) {
    body.prospected_by_current_team = ["no"];
  }

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
  // Apollo caps api_search paging at ~50k records. Cap by records (not a flat
  // 500 pages) so a larger per_page still reaches the full window.
  const totalPages = Math.min(
    Math.ceil(50_000 / perPage),
    Math.max(1, Math.ceil(totalEntries / perPage)),
  );
  return {
    people: peopleRaw.map(normalizePerson).filter((p): p is ApolloPerson => !!p),
    page: Math.max(1, page),
    totalPages,
    totalEntries,
  };
}

/** Total / Net New / Saved counts for a query (free, 3 lightweight calls). */
export async function apolloCounts(
  criteria: ApolloSearchCriteria,
): Promise<{ total: number; netNew: number; saved: number }> {
  const one = async (prospected: "all" | "net_new" | "saved") => {
    const r = await apolloSearchPeople(
      { ...criteria, prospected, perPage: 1 },
      1,
    );
    return r.totalEntries;
  };
  const [total, netNew, saved] = await Promise.all([
    one("all"),
    one("net_new"),
    one("saved"),
  ]);
  return { total, netNew, saved };
}

export type ApolloMatch = {
  id: string | null;
  email: string | null;
  email_status: string | null; // verified | likely | unverified | unavailable | ...
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
    email_status: str(raw.email_status),
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

const EMPTY_MATCH: ApolloMatch = {
  id: null,
  email: null,
  email_status: null,
  first_name: null,
  last_name: null,
  name: null,
  title: null,
  linkedin_url: null,
  city: null,
  state: null,
  country: null,
  organization_name: null,
  organization_website: null,
};

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
    // Pad null slots so results stay aligned with the input `ids` order
    // (Apollo returns null for an unmatched id) — mirrors
    // apolloBulkEnrichByEmail. A null-email placeholder is filtered out by
    // callers that only care about revealed emails.
    for (const m of matchesRaw) {
      out.push(m && typeof m === "object" ? normalizeMatch(m) : EMPTY_MATCH);
    }
  }
  return out;
}

export type EnrichRecord = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
};

/**
 * Verify/refresh existing contacts by EMAIL (most legacy contacts have no
 * apollo id). Sends name + company too for a more reliable match. Returns
 * one ApolloMatch per input record, in order (email null = not revealed).
 * ~1 credit per revealed record.
 */
export async function apolloBulkEnrichByEmail(
  records: EnrichRecord[],
): Promise<ApolloMatch[]> {
  const out: ApolloMatch[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const data = (await apolloPost("/people/bulk_match", {
      reveal_personal_emails: false,
      details: chunk.map((r) => ({
        email: r.email,
        first_name: r.firstName ?? undefined,
        last_name: r.lastName ?? undefined,
        organization_name: r.company ?? undefined,
      })),
    })) as Record<string, unknown>;
    const matchesRaw = Array.isArray(data.matches)
      ? (data.matches as Array<Record<string, unknown> | null>)
      : [];
    for (let j = 0; j < chunk.length; j++) {
      const m = matchesRaw[j];
      // Keep alignment with input order even when Apollo returns a null slot.
      out.push(
        m && typeof m === "object"
          ? normalizeMatch(m)
          : {
              id: null,
              email: null,
              email_status: "not_found",
              first_name: null,
              last_name: null,
              name: null,
              title: null,
              linkedin_url: null,
              city: null,
              state: null,
              country: null,
              organization_name: null,
              organization_website: null,
            },
      );
    }
  }
  return out;
}
