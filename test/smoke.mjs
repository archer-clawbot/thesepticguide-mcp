import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const mode = process.argv[2] ?? "stdio";
const t = mode === "http"
  ? new StreamableHTTPClientTransport(new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp"))
  : new StdioClientTransport({ command: "node", args: ["dist/stdio.js"] });
const c = new Client({ name: "smoke", version: "0" }); await c.connect(t);
const show = (n, r) => { const s = r.content[0].text; console.log(`\n== ${n} ${r.isError ? "(isError)" : ""}\n` + (s.length > 900 ? s.slice(0, 900) + "\n…[truncated]" : s)); };
console.log("tools:", (await c.listTools()).tools.map((x) => x.name).join(", "));
const calls = [
  ["list_states", {}],
  ["get_state_licensing", { state: "TX" }],
  ["search_septic_companies", { state: "Texas", city: "Temple", limit: 1 }],
  ["search_septic_companies", { state: "tx", county: "Bell", service: "pumping", limit: 1 }],
  ["search_septic_companies", { state: "TX", zip: "75861", licensed_only: true, limit: 1 }],
  ["search_septic_companies", { state: "Texas", limit: 1 }],
  ["search_septic_companies", { state: "GA", limit: 1 }],
  ["search_septic_companies", { state: "Florida", licensed_only: true, limit: 1 }],
  ["search_septic_companies", { state: "Ohio", limit: 1 }],
  ["get_state_licensing", { state: "Georgia" }],
  ["get_cost_guide", {}],
  ["get_cost_guide", { topic: "pumping" }],
  ["get_state_licensing", { state: "Narnia" }],
];
for (const [n, a] of calls) { const t0=Date.now(); const r = await c.callTool({ name: n, arguments: a }); if (n==="list_states"){const j=JSON.parse(r.content[0].text);console.log(`\n== list_states: ${j.states.length} states; first:`, JSON.stringify(j.states[0]));} else show(`${n} ${JSON.stringify(a)} [${Date.now()-t0}ms]`, r); }
await c.close();
