import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const c = new Client({ name: "t", version: "0" }); await c.connect(new StdioClientTransport({ command: "node", args: ["dist/stdio.js"] }));
for (const st of ["FL","Ohio","GA"]) {
  const l = JSON.parse((await c.callTool({ name: "get_state_licensing", arguments: { state: st } })).content[0].text);
  const s = JSON.parse((await c.callTool({ name: "search_septic_companies", arguments: { state: st, limit: 1 } })).content[0].text);
  console.log(st, JSON.stringify(l.licensing_agencies), "qa:", l.qa.length, "| listings:", s.listings_found, "counties:", s.county_pages_checked, "| first:", s.results[0]?.name, s.results[0]?.location);
}
for (const t of ["drain field","inspection","aerobic"]) { const g = JSON.parse((await c.callTool({ name: "get_cost_guide", arguments: { topic: t } })).content[0].text); console.log(t, "->", g.topic, "tables:", g.tables.length, "sources:", g.cited_sources.length, "|", g.short_answer?.slice(0,90)); }
await c.close();
