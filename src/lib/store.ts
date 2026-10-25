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
  if (env.onVercel()) throw new StoreError("No cache store: add Upstash Redis to this Vercel project.");
  await fs.mkdir(FILE_DIR, { recursive: true });
  await fs.writeFile(path.join(FILE_DIR, `${key}.json`), JSON.stringify(value));
}
