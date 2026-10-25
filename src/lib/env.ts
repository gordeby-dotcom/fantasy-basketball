import "server-only";

// All secrets are read here, on the server only. Never pass these values to client components or logs.
function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

// First non-empty variable named exactly one of `names`, or ending in `_<name>` (a prefixed copy).
function findSuffix(names: string[]): string {
  for (const name of names) {
    if (read(name)) return read(name);
    const prefixed = Object.keys(process.env).find((k) => k.endsWith(`_${name}`) && read(k));
    if (prefixed) return read(prefixed);
  }
  return "";
}

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
    url: () => findSuffix(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]),
    token: () => findSuffix(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"]),
  },
  onVercel: () => Boolean(read("VERCEL")),
};
