// Vercel Node serverless function. vercel.json rewrites /mcp -> /api/mcp.
import { handleMcp } from "../dist/http.js";
export default handleMcp;
