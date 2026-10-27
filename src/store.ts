// Data access: serves the bundled snapshot by default; live mode (TSG_LIVE=1, or snapshot missing) crawls the site.
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import * as live from "./data.js";

const DATA_DIR = process.env.TSG_SNAPSHOT_DIR ?? fileURLToPath(new URL("../data/", import.meta.url));
export const LIVE = process.env.TSG_LIVE === "1" || !existsSync(`${DATA_DIR}/snapshot.json`);

interface Snap { schema_version: number; data_as_of: string; generated_at: string; site: string; index: live.SiteIndex; licensing: Record<string, live.Licensing>; cost: Record<string, live.CostGuide>; }
let snap: Snap | null = null;
const S = (): Snap => (snap ??= JSON.parse(readFileSync(`${DATA_DIR}/snapshot.json`, "utf8")) as Snap);
const coCache = new Map<string, live.CompanyState>();

export const meta = () => LIVE ? { data_mode: "live", data_as_of: new Date().toISOString().slice(0, 10) } : { data_mode: "snapshot", data_as_of: S().data_as_of };
export const index = async (): Promise<live.SiteIndex> => LIVE ? live.crawlIndex() : S().index;
export const licensing = async (s: string) => LIVE ? live.crawlLicensing(s) : S().licensing[s];
export const cost = async (t: string) => LIVE ? live.crawlCost(t) : S().cost[t];
export async function companies(s: string): Promise<live.CompanyState> {
  if (LIVE) return live.crawlCompanies(s);
  let c = coCache.get(s);
  if (!c) { c = JSON.parse(gunzipSync(readFileSync(`${DATA_DIR}/companies/${s}.json.gz`)).toString("utf8")) as live.CompanyState; coCache.set(s, c); }
  return c;
}
