// npm run snapshot: crawl thesepticguide.com and write data/snapshot.json + data/companies/<state>.json.gz
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { crawlIndex, crawlLicensing, crawlCompanies, crawlCost, pool, SITE } from "./data.js";

const out = new URL("../data/", import.meta.url);
const index = await crawlIndex();
console.error(`index: ${index.licensing_states.length} licensing, ${index.company_states.length} company states, ${index.cost_topics.length} cost topics`);
const licensing: Record<string, unknown> = {}, cost: Record<string, unknown> = {};
for (const [s, v] of await pool(index.licensing_states, 6, async (s) => [s, await crawlLicensing(s)] as const)) licensing[s] = v;
for (const [t, v] of await pool(index.cost_topics, 6, async (t) => [t, await crawlCost(t)] as const)) cost[t] = v;
rmSync(new URL("companies/", out), { recursive: true, force: true });
mkdirSync(new URL("companies/", out), { recursive: true });
const summary: Record<string, unknown> = {};
for (const s of index.company_states) {
  const c = await crawlCompanies(s);
  writeFileSync(new URL(`companies/${s}.json.gz`, out), gzipSync(JSON.stringify(c), { level: 9 }));
  summary[s] = { headline_count: c.headline_count, listings: c.listings.length, county_pages: c.county_pages.length, state_page_rows: c.state_page_rows };
  console.error(`${s}: headline ${c.headline_count}, listed ${c.listings.length}, county pages ${c.county_pages.length}`);
}
const now = new Date();
writeFileSync(new URL("snapshot.json", out), JSON.stringify({
  schema_version: 1,
  data_as_of: now.toISOString().slice(0, 10),
  generated_at: now.toISOString(),
  site: SITE, index, company_summary: summary, licensing, cost,
}));
console.error("snapshot written");
