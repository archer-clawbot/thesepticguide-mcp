import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SITE, slugify, stateSlug } from "./data.js";
import * as store from "./store.js";

export const VERSION = "0.2.0";
const ok = (data: object) => ({ content: [{ type: "text" as const, text: JSON.stringify({ ...data, ...store.meta() }, null, 2) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

export function createServer(): McpServer {
  const server = new McpServer({ name: "thesepticguide", version: VERSION });

  server.registerTool("list_states", {
    title: "List covered states",
    description: "List the U.S. states that have a septic licensing page and/or a septic company directory page on thesepticguide.com, with links.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async () => {
    const ix = await store.index();
    const all = [...new Set([...ix.licensing_states, ...ix.company_states])].sort();
    return ok({ states: all.map((s) => ({
      state: s,
      licensing_url: ix.licensing_states.includes(s) ? `${SITE}/septic-licensing/${s}/` : null,
      companies_url: ix.company_states.includes(s) ? `${SITE}/septic-companies/${s}/` : null,
    })), source_url: `${SITE}/sitemap-0.xml` });
  });

  server.registerTool("get_state_licensing", {
    title: "State septic licensing",
    description: "Who licenses septic installers/pumpers in a U.S. state, the agency's official license lookup link, and the licensing Q&A published on thesepticguide.com.",
    inputSchema: { state: z.string().describe("State name or 2-letter code, e.g. 'Texas' or 'TX'") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ state }) => {
    const slug = stateSlug(state);
    if (!(await store.index()).licensing_states.includes(slug)) return fail(`No licensing page for "${state}" on thesepticguide.com. Use list_states.`);
    return ok(await store.licensing(slug));
  });

  server.registerTool("search_septic_companies", {
    title: "Search septic companies",
    description: "Search the septic companies thesepticguide.com lists in a state, optionally filtered by city, county, ZIP, service or license match. Returns each listing's state license record(s) with the agency verify link, phone and website as published.",
    inputSchema: {
      state: z.string().describe("State name or 2-letter code"),
      city: z.string().optional().describe("City name, e.g. 'Temple'"),
      county: z.string().optional().describe("County name, e.g. 'Bell' or 'Bell County'"),
      zip: z.string().regex(/^\d{5}$/).optional().describe("5-digit ZIP code"),
      service: z.string().optional().describe("Service keyword, e.g. 'pumping', 'aerobic', 'installation'"),
      licensed_only: z.boolean().optional().describe("Only listings matched to a state license or certification record"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ state, city, county, zip, service, licensed_only, limit }) => {
    const slug = stateSlug(state);
    if (!(await store.index()).company_states.includes(slug)) return fail(`No company directory for "${state}" on thesepticguide.com. Use list_states.`);
    const d = await store.companies(slug);
    let rows = d.listings;
    if (city) rows = rows.filter((r) => r.city_slug === slugify(city) || (r.location ?? "").toLowerCase().startsWith(city.trim().toLowerCase() + ","));
    if (county) { const c = slugify(county).replace(/-(county|parish|borough)$/, ""); rows = rows.filter((r) => r.county?.replace(/-(county|parish|borough)$/, "") === c); }
    if (zip) rows = rows.filter((r) => r.zip === zip);
    if (service) { const s = slugify(service); rows = rows.filter((r) => r.services.some((t) => t.includes(s))); }
    if (licensed_only) rows = rows.filter((r) => r.license_matched);
    const n = limit ?? 25;
    const counts: Record<string, unknown> = {
      listed_on_pages: d.listings.length,
      state_page_headline_count: d.headline_count,
      county_pages: d.county_pages.length,
    };
    if (d.headline_count != null && d.headline_count !== d.listings.length)
      counts.count_note = `The state page headline says ${d.headline_count}; ${d.listings.length} listings are actually rendered across the state page and its county pages. Results cover the rendered listings only.`;
    return ok({
      state: slug, ...counts, matches: rows.length, returned: Math.min(n, rows.length),
      results: rows.slice(0, n).map(({ city_slug, ...r }) => r),
      note: "Listings and license matches are as published on thesepticguide.com. Confirm a license with the agency verify_url before hiring.",
      source_url: d.source_url,
    });
  });

  server.registerTool("get_cost_guide", {
    title: "Septic cost guide",
    description: "Septic cost guidance (pumping, inspection, repair, installation, drain field, tank replacement, aerobic systems) as published on thesepticguide.com: the short answer, cost tables, and the third-party sources the page cites. Call with no topic to list topics.",
    inputSchema: { topic: z.string().optional().describe("Cost topic slug or words, e.g. 'septic-tank-pumping-cost' or 'drain field'") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ topic }) => {
    const topics = (await store.index()).cost_topics;
    if (!topic) return ok({ topics: topics.map((t) => ({ topic: t, url: `${SITE}/${t}/` })), source_url: `${SITE}/sitemap-0.xml` });
    const t = slugify(topic);
    const pick = topics.find((x) => x === t) ?? topics.find((x) => x.includes(t.replace(/-cost$/, "")));
    if (!pick) return fail(`No cost guide matching "${topic}". Topics: ${topics.join(", ")}`);
    return ok(await store.cost(pick));
  });

  return server;
}
