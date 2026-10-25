import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { env } from "./env";

// Tiny key-value cache. Upstash Redis on Vercel; a JSON file in .data/ for local development.

const FILE_DIR = path.join(process.cwd(), ".data");

export class StoreError extends Error {}

function redis(): Redis | null {
  const url = env.redis.url();
  const token = env.redis.token();
  return url && token ? new Redis({ url, token }) : null;
}

export async function getValue<T>(key: string): Promise<T | null> {
  const r = redis();
  if (r) return (await r.get<T>(key)) ?? null;
  try {
    const raw = await fs.readFile(path.join(FILE_DIR, `${key}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  const r = redis();
  if (r) {
    await r.set(key, value);
    return;
  }
  // Vercel's file system is read-only, so the local-file fallback can't work there.
  if (env.onVercel()) {
    throw new StoreError(
      "No cache store: connect Upstash Redis in the Vercel project's Storage tab, then redeploy. " +
        "The app looks for KV_REST_API_URL and KV_REST_API_TOKEN (any prefix) or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  await fs.mkdir(FILE_DIR, { recursive: true });
  await fs.writeFile(path.join(FILE_DIR, `${key}.json`), JSON.stringify(value));
}

// For the diagnostics page: which store is in use, and whether a write and read round-trip works.
export async function checkStore(): Promise<{ kind: "redis" | "file" | "none"; ok: boolean; message?: string }> {
  const r = redis();
  if (!r) return env.onVercel() ? { kind: "none", ok: false, message: "No Upstash variables found" } : { kind: "file", ok: true };
  try {
    const stamp = String(Date.now());
    await r.set("health-check", stamp);
    const back = await r.get<string | number>("health-check");
    return String(back) === stamp ? { kind: "redis", ok: true } : { kind: "redis", ok: false, message: "Read back a different value" };
  } catch (err) {
    return { kind: "redis", ok: false, message: err instanceof Error ? err.message.slice(0, 200) : "Redis call failed" };
  }
}
