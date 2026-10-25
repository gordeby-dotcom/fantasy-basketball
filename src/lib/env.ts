import "server-only";

// All secrets are read here, on the server only. Never pass these values to client components or logs.
function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

// Name of the first non-empty variable called exactly one of `names`, or ending in `_<name>` (a prefixed copy).
function findName(names: string[]): string {
  for (const name of names) {
    if (read(name)) return name;
    const prefixed = Object.keys(process.env).find((k) => k.endsWith(`_${name}`) && read(k));
    if (prefixed) return prefixed;
  }
  return "";
}

function findSuffix(names: string[]): string {
  const name = findName(names);
  return name ? read(name) : "";
}

const REDIS_URL_NAMES = ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"];
const REDIS_TOKEN_NAMES = ["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"];

export const env = {
  espn: {
    leagueId: () => read("ESPN_LEAGUE_ID"),
    season: () => Number(read("ESPN_SEASON") || "2027"),
    s2: () => read("ESPN_S2"),
    swid: () => read("ESPN_SWID"),
    teamId: () => (read("ESPN_TEAM_ID") ? Number(read("ESPN_TEAM_ID")) : undefined),
  },
  bbm: {
    username: () => read("BBM_USERNAME"),
    password: () => read("BBM_PASSWORD"),
  },
  sitePassword: () => read("SITE_PASSWORD"),
  authSecret: () => read("AUTH_SECRET") || read("SITE_PASSWORD"),
  cronSecret: () => read("CRON_SECRET"),
  // Vercel's Upstash integration names these KV_REST_API_*, with an optional custom prefix (e.g. STORAGE_KV_REST_API_URL);
  // a direct Upstash setup uses UPSTASH_REDIS_REST_*.
  redis: {
    url: () => findSuffix(REDIS_URL_NAMES),
    token: () => findSuffix(REDIS_TOKEN_NAMES),
    urlName: () => findName(REDIS_URL_NAMES),
    tokenName: () => findName(REDIS_TOKEN_NAMES),
  },
  // For the diagnostics page: names only, never values.
  isSet: (name: string) => Boolean(read(name)),
  storageLikeNames: () => Object.keys(process.env).filter((k) => /KV_|REDIS|UPSTASH/.test(k)).sort(),
  onVercel: () => Boolean(read("VERCEL")),
};
