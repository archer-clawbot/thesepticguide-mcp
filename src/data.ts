// Live crawl + parsing of thesepticguide.com public pages. Used by the snapshot builder and by live mode.
import * as cheerio from "cheerio";

export const SITE = "https://thesepticguide.com";
const UA = "thesepticguide-mcp/0.2 (+https://thesepticguide.com/ai-info/)";
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; body: string }>();

export async function fetchText(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.body;
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error(`thesepticguide.com returned HTTP ${res.status} for ${url}`);
      const body = await res.text();
      cache.set(url, { at: Date.now(), body });
      return body;
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
  throw lastErr;
}

export const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const ABBR: Record<string, string> = { AL:"alabama",AK:"alaska",AZ:"arizona",AR:"arkansas",CA:"california",CO:"colorado",CT:"connecticut",DE:"delaware",FL:"florida",GA:"georgia",HI:"hawaii",ID:"idaho",IL:"illinois",IN:"indiana",IA:"iowa",KS:"kansas",KY:"kentucky",LA:"louisiana",ME:"maine",MD:"maryland",MA:"massachusetts",MI:"michigan",MN:"minnesota",MS:"mississippi",MO:"missouri",MT:"montana",NE:"nebraska",NV:"nevada",NH:"new-hampshire",NJ:"new-jersey",NM:"new-mexico",NY:"new-york",NC:"north-carolina",ND:"north-dakota",OH:"ohio",OK:"oklahoma",OR:"oregon",PA:"pennsylvania",RI:"rhode-island",SC:"south-carolina",SD:"south-dakota",TN:"tennessee",TX:"texas",UT:"utah",VT:"vermont",VA:"virginia",WA:"washington",WV:"west-virginia",WI:"wisconsin",WY:"wyoming",DC:"district-of-columbia" };
export const stateSlug = (s: string) => ABBR[s.trim().toUpperCase()] ?? slugify(s);

function jsonLd($: cheerio.CheerioAPI): any[] {
  return $('script[type="application/ld+json"]').toArray().flatMap((el) => {
    try { return [JSON.parse($(el).text())]; } catch { return []; }
  });
}

export interface SiteIndex { licensing_states: string[]; company_states: string[]; cost_topics: string[]; }

export async function crawlIndex(): Promise<SiteIndex> {
  const xml = await fetchText(`${SITE}/sitemap-0.xml`);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const sec = (s: string) => urls.map((u) => u.match(new RegExp(`^${SITE}/${s}/([a-z-]+)/$`))?.[1]).filter(Boolean) as string[];
  return {
    licensing_states: sec("septic-licensing").sort(),
    company_states: sec("septic-companies").sort(),
    cost_topics: urls.filter((u) => /^https:\/\/thesepticguide\.com\/[a-z-]+-cost\/$/.test(u)).map((u) => u.split("/")[3]).sort(),
  };
}

export interface Licensing { state: string; title: string; page_updated: string | null; licensing_agencies: { name: string; license_lookup_url: string }[]; qa: { question: string; answer: string }[]; source_url: string; }

export async function crawlLicensing(slug: string): Promise<Licensing> {
  const url = `${SITE}/septic-licensing/${slug}/`;
  const $ = cheerio.load(await fetchText(url));
  const ld = jsonLd($);
  const page = ld.find((x) => x["@type"] === "WebPage") ?? {};
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  return {
    state: slug, title: page.name ?? clean($("h1").first().text()), page_updated: page.dateModified ?? null,
    licensing_agencies: [page.mentions].flat().filter(Boolean).map((m: any) => ({ name: m.name, license_lookup_url: m.url })),
    qa: (faq?.mainEntity ?? []).map((q: any) => ({ question: q.name, answer: q.acceptedAnswer?.text })),
    source_url: url,
  };
}

export interface Listing { name: string; location: string | null; county: string | null; city_slug: string | null; zip: string | null; services: string[]; license_matched: boolean; licenses: { text: string; verify_url: string | null }[]; phone: string | null; website: string | null; profile_url: string | null; source_url: string; }
export interface CompanyState {
  state: string; source_url: string;
  headline_count: number | null;        // the "N septic companies" number in the state page's meta description
  headline_license_matched: number | null;
  county_pages: { county: string; stated_listed: number | null; parsed: number; source_url: string }[];
  state_page_rows: number;              // listings rendered directly on the state page (counties without their own page)
  listings: Listing[];
}

function parseListings($: cheerio.CheerioAPI, slug: string, pageUrl: string, county: string | null): Listing[] {
  return $("li.listing").toArray().map((el) => {
    const li = $(el);
    const where = clean(li.find("p.where").first().text());
    const zipM = where.match(/\b[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b/);
    const prof = li.find(`a[href^="/septic-companies/${slug}/"]`).first().attr("href");
    return {
      name: clean(li.find("h3").first().text()),
      location: where || null,
      county,
      city_slug: li.attr("data-city") || null,
      zip: zipM ? zipM[1] : null,
      services: (li.attr("data-terms") ?? "").split("|").filter(Boolean),
      license_matched: li.attr("data-lic") === "1",
      licenses: li.find("ul.lic > li").toArray().map((l) => ({ text: clean($(l).text()), verify_url: $(l).find("a").attr("href") ?? null })),
      phone: clean(li.find('a[data-ev="call"]').first().text()) || null,
      website: li.find('a[data-ev="site"]').attr("href") ?? null,
      profile_url: prof ? SITE + prof : null,
      source_url: pageUrl,
    };
  });
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export async function crawlCompanies(slug: string): Promise<CompanyState> {
  const url = `${SITE}/septic-companies/${slug}/`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const desc = $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "";
  const hc = desc.match(/([\d,]+)\s+septic companies/i);
  const hm = desc.match(/([\d,]+)\s+matched to state license/i);
  const re = new RegExp(`href="/septic-companies/${slug}/([a-z0-9-]+-(?:county|parish|borough))/"[^>]*>([\\s\\S]{0,300}?)</a>`, "g");
  const stated = new Map<string, number | null>();
  for (const m of html.matchAll(re)) if (!stated.has(m[1])) { const n = m[2].match(/(\d+)\s*listed/); stated.set(m[1], n ? +n[1] : null); }
  const counties = [...stated.keys()];
  const countyRows = await pool(counties, 6, async (c) => {
    const u = `${SITE}/septic-companies/${slug}/${c}/`;
    return { c, u, rows: parseListings(cheerio.load(await fetchText(u)), slug, u, c) };
  });
  const stateRows = parseListings($, slug, url, null);
  // Only drop rows that are byte-for-byte identical records (same name, place, phone, services and license text).
  // Same-name rows with different services/licenses are distinct state-list records and are kept.
  const seen = new Set<string>();
  const listings = [...countyRows.flatMap((x) => x.rows), ...stateRows].filter((r) => {
    const k = JSON.stringify([r.name, r.location, r.phone, r.services, r.licenses, r.profile_url, r.county]);
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  return {
    state: slug, source_url: url,
    headline_count: hc ? +hc[1].replace(/,/g, "") : null,
    headline_license_matched: hm ? +hm[1].replace(/,/g, "") : null,
    county_pages: countyRows.map((x) => ({ county: x.c, stated_listed: stated.get(x.c) ?? null, parsed: x.rows.length, source_url: x.u })),
    state_page_rows: stateRows.length,
    listings,
  };
}

export interface CostGuide { topic: string; title: string; page_updated: string | null; short_answer: string | null; tables: { section: string | null; columns: string[]; rows: string[][] }[]; cited_sources: { title: string; url: string }[]; source_url: string; }

export async function crawlCost(topic: string): Promise<CostGuide> {
  const url = `${SITE}/${topic}/`;
  const $ = cheerio.load(await fetchText(url));
  const art = $("article.guide").first().length ? $("article.guide").first() : $("main");
  const tables = art.find("table").toArray().map((tb) => ({
    section: clean($(tb).prevAll("h2,h3").first().text()) || null,
    columns: $(tb).find("thead th").toArray().map((th) => clean($(th).text())),
    rows: $(tb).find("tbody tr").toArray().map((tr) => $(tr).find("td,th").toArray().map((td) => clean($(td).text()))),
  }));
  const seen = new Set<string>();
  const cited_sources = art.find('a[href^="http"]').toArray().map((a) => ({ title: clean($(a).text()), url: $(a).attr("href")! }))
    .filter((s) => !s.url.startsWith(SITE) && !seen.has(s.url) && seen.add(s.url));
  const page_updated = $('meta[property="article:modified_time"]').attr("content") ?? jsonLd($).find((x) => x.dateModified)?.dateModified ?? null;
  return { topic, title: clean($("h1").first().text()), page_updated, short_answer: clean(art.find("section.answer p").first().text()) || null, tables, cited_sources, source_url: url };
}

export { pool };
