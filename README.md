# The Septic Guide MCP server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server for [thesepticguide.com](https://thesepticguide.com/), a U.S. septic contractor directory built from published state license and certification records.

No API key. No writes. Every result carries a `source_url` on thesepticguide.com.

## Tools

| Tool | What it returns |
|---|---|
| `list_states` | States with a licensing page and/or company directory, with links |
| `get_state_licensing` | `state` (name or code): the agency that licenses septic work, its official lookup URL, page date, and the page's licensing Q&A |
| `search_septic_companies` | `state` plus optional `city`, `county`, `zip`, `service`, `licensed_only`, `limit`: listings with license number(s), agency verify link, phone, website, profile link |
| `get_cost_guide` | optional `topic` (e.g. `pumping`, `drain field`): short answer, cost tables, and the third-party sources the page cites. No topic = list topics |

## Data

By default the server answers from a **bundled snapshot** in `data/` (`data/snapshot.json` for the index, licensing and cost pages, plus one gzipped file per state in `data/companies/`). Every response includes `data_mode` and `data_as_of` (the snapshot date). Rebuild it with:

```bash
npm run snapshot   # crawls thesepticguide.com (sitemap, state + county pages) and rewrites data/
```

Set `TSG_LIVE=1` to skip the snapshot and read thesepticguide.com live instead (6-hour in-memory cache). Live mode is also used automatically if `data/` is missing.

### Company counts

Each state page's meta description gives a headline number (e.g. Texas: "363 septic companies"). In some states the listings actually rendered on the state page plus its county pages come to fewer (Texas: 360). The server never pads results: `search_septic_companies` reports `listed_on_pages` (rendered listings it searched) and `state_page_headline_count` (the page's own number), with a `count_note` when they differ. Same-name listings with different services or license records are distinct state-list records and are kept.

## Data & limits

- Read-only. No writes, no API key, no user data collected.
- Public data from thesepticguide.com. Every result carries a `source_url` on thesepticguide.com.
- License data comes from published state agency license and certification lists, as matched by thesepticguide.com. Confirm any license with the agency `verify_url` before hiring.
- Not affiliated with any state agency.
- Snapshot data can lag the live site; check `data_as_of`.

## Use

Remote (Streamable HTTP): `https://mcp.thesepticguide.com/mcp`

Local (stdio):

```bash
git clone https://github.com/archer-clawbot/thesepticguide-mcp && cd thesepticguide-mcp && npm install && npm run build
```

```json
{ "mcpServers": { "thesepticguide": { "command": "node", "args": ["/path/to/thesepticguide-mcp/dist/stdio.js"] } } }
```

Docker: `docker build -t thesepticguide-mcp . && docker run -i --rm thesepticguide-mcp`

Develop:

```bash
npm install && npm run build
npm test                 # stdio smoke test with the MCP SDK client
npm test -- http         # same against MCP_URL (default http://localhost:3000/mcp)
npm run start:http       # http://localhost:3000/mcp
```

Deploy on Vercel: `api/mcp.ts` + `vercel.json` (rewrites `/mcp` to the function).

<!-- mcp-name: com.thesepticguide/thesepticguide -->

## License

MIT. Copyright (c) 2026 Catalyst Digital Services LLC.
