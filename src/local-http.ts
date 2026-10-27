import { createServer as createHttp } from "node:http";
import { handleMcp } from "./http.js";
const port = Number(process.env.PORT ?? 3000);
createHttp(async (req, res) => {
  if (!req.url?.startsWith("/mcp")) { res.writeHead(404).end("Not found. MCP endpoint is /mcp"); return; }
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  try { await handleMcp(Object.assign(req, { body: raw ? JSON.parse(raw) : undefined }), res); }
  catch (e) { if (!res.headersSent) res.writeHead(500).end(String(e)); }
}).listen(port, () => console.error(`thesepticguide-mcp listening on http://localhost:${port}/mcp`));
