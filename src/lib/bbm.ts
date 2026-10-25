import "server-only";
import * as cheerio from "cheerio";
import { env } from "./env";
import { STAT } from "./espn/constants";
import type { StatLine } from "./types";

// Signs in to Basketball Monster with Dylan's account and reads the Player Rankings 26-27 stats table.
// The site is ASP.NET WebForms: every POST must echo the page's hidden __VIEWSTATE fields.

const ORIGIN = "https://basketballmonster.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export class BbmError extends Error {}

export interface BbmProjection {
  name: string;
  team: string;
  games: number; // games played this season (the table's "g" column)
  stats: StatLine; // per game, ESPN stat IDs
}

class CookieJar {
  private cookies = new Map<string, string>();
  store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function get(jar: CookieJar, path: string): Promise<{ html: string; url: string }> {
  let url = `${ORIGIN}/${path}`;
  for (let hops = 0; hops < 5; hops++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: jar.header() }, redirect: "manual" });
    jar.store(res);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).toString();
      continue;
    }
    return { html: await res.text(), url };
  }
  throw new BbmError("Basketball Monster redirected too many times.");
}

function hiddenFields(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const out: Record<string, string> = {};
  $("form#form1 input[type=hidden]").each((_, el) => {
    const name = $(el).attr("name");
    if (name) out[name] = $(el).attr("value") ?? "";
  });
  return out;
}

// Re-submit a WebForms page as if a dropdown changed: echo every field's current value, then apply overrides.
async function postBack(
  jar: CookieJar,
  path: string,
  html: string,
  target: string,
  overrides: Record<string, string>,
): Promise<string> {
  const $ = cheerio.load(html);
  const body = new URLSearchParams();
  $("form#form1 input").each((_, el) => {
    const name = $(el).attr("name");
    const type = ($(el).attr("type") ?? "text").toLowerCase();
    if (!name || ((type === "checkbox" || type === "radio") && $(el).attr("checked") === undefined)) return;
    body.set(name, $(el).attr("value") ?? "");
  });
  $("form#form1 select").each((_, el) => {
    const name = $(el).attr("name");
    if (name) body.set(name, $(el).find("option[selected]").attr("value") ?? $(el).find("option").first().attr("value") ?? "");
  });
  body.set("__EVENTTARGET", target);
  body.set("__EVENTARGUMENT", "");
  for (const [k, v] of Object.entries(overrides)) body.set(k, v);
  const res = await fetch(`${ORIGIN}/${path}`, {
    method: "POST",
    headers: { "User-Agent": UA, Cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded", Referer: `${ORIGIN}/${path}` },
    body,
  });
  jar.store(res);
  return res.text();
}

async function signIn(jar: CookieJar): Promise<void> {
  const username = env.bbm.username();
  const password = env.bbm.password();
  if (!username || !password) throw new BbmError("BBM_USERNAME and BBM_PASSWORD aren't set.");

  const page = await get(jar, "login.aspx");
  const body = new URLSearchParams({
    ...hiddenFields(page.html),
    UsernameTB: username,
    PasswordTB: password,
    RememberMeCB: "on",
    LoginButton: "",
  });
  const res = await fetch(`${ORIGIN}/login.aspx`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Cookie: jar.header(),
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${ORIGIN}/login.aspx`,
    },
    body,
    redirect: "manual",
  });
  jar.store(res);
  // A successful sign-in redirects away from the login page; a failed one re-renders the form.
  if (res.status === 200 && (await res.text()).includes("PasswordTB")) {
    throw new BbmError("Basketball Monster sign-in failed. Check BBM_USERNAME and BBM_PASSWORD.");
  }
}

// Column headers on BBM stat tables -> how to read them.
const COLUMNS: Record<string, (v: number, s: StatLine) => void> = {
  "p/g": (v, s) => (s[STAT.PTS] = v),
  "3/g": (v, s) => (s[STAT.TPM] = v),
  "r/g": (v, s) => (s[STAT.REB] = v),
  "a/g": (v, s) => (s[STAT.AST] = v),
  "s/g": (v, s) => (s[STAT.STL] = v),
  "b/g": (v, s) => (s[STAT.BLK] = v),
  "to/g": (v, s) => (s[STAT.TO] = v),
  "fga/g": (v, s) => (s[STAT.FGA] = v),
  "fta/g": (v, s) => (s[STAT.FTA] = v),
  "fg%": (v, s) => (s[-1] = v),
  "ft%": (v, s) => (s[-2] = v),
  "3pa/g": (v, s) => (s[STAT.TPA] = v),
  "dd/g": (v, s) => (s[STAT.DD] = v),
  "td/g": (v, s) => (s[STAT.TD] = v),
};

export function parseProjectionTable(html: string): BbmProjection[] {
  const $ = cheerio.load(html);
  const table = $("table.modern-stats-table").first();
  if (!table.length) return [];

  let headers: string[] = [];
  const rows: BbmProjection[] = [];
  table.find("tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((__, c) => $(c).text().trim().replace(/\s+/g, " "))
      .get();
    // BBM repeats the header row every so often down the table.
    if (cells.includes("Name") && cells.includes("Team")) {
      headers = cells.map((c) => c.toLowerCase());
      return;
    }
    if (!headers.length) return;
    const name = cells[headers.indexOf("name")];
    if (!name) return;
    const stats: StatLine = {};
    headers.forEach((h, i) => {
      const read = COLUMNS[h];
      const v = parseFloat(cells[i]);
      if (read && !Number.isNaN(v)) read(v, stats);
    });
    // Made shots from attempts and percentage.
    if (stats[-1] !== undefined && stats[STAT.FGA] !== undefined) stats[STAT.FGM] = stats[-1] * stats[STAT.FGA];
    if (stats[-2] !== undefined && stats[STAT.FTA] !== undefined) stats[STAT.FTM] = stats[-2] * stats[STAT.FTA];
    delete stats[-1];
    delete stats[-2];
    const games = parseInt(cells[headers.indexOf("g")] ?? "", 10);
    rows.push({ name, team: cells[headers.indexOf("team")] ?? "", games: Number.isNaN(games) ? 0 : games, stats });
  });
  return rows;
}

// Per-game stats for this season from the Player Rankings page. The page is public; signing in first
// applies any settings saved on Dylan's account, so a failed sign-in is reported but not fatal.
export async function fetchBbmRankings(): Promise<{ rows: BbmProjection[]; warning?: string }> {
  const jar = new CookieJar();
  let warning: string | undefined;
  try {
    await signIn(jar);
  } catch (err) {
    warning = err instanceof BbmError ? err.message : "Basketball Monster sign-in failed.";
  }
  const page = await get(jar, "playerrankings.aspx");
  // The table defaults to "Top Players"; switch the filter to "All Players" so streamers and rookies are included.
  const all = await postBack(jar, "playerrankings.aspx", page.html, "PlayerFilterControl", { PlayerFilterControl: "AllPlayers" });
  let rows = parseProjectionTable(all);
  if (rows.length === 0) rows = parseProjectionTable(page.html);
  if (rows.length === 0) throw new BbmError("Basketball Monster's rankings page changed layout.");
  return { rows, warning };
}

// "Luka Dončić Jr." -> "luka doncic"
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
