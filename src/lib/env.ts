import "server-only";

// All secrets are read here, on the server only. Never pass these values to client components or logs.
function read(name: string): string {
  return (process.env[name] ?? "").trim();
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
  // Vercel's Upstash integration names these KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*.
  redis: {
    url: () => read("UPSTASH_REDIS_REST_URL") || read("KV_REST_API_URL"),
    token: () => read("UPSTASH_REDIS_REST_TOKEN") || read("KV_REST_API_TOKEN"),
  },
  onVercel: () => Boolean(read("VERCEL")),
};
