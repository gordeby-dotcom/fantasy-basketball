import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken } from "@/lib/session";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const expected = env.sitePassword();
  if (!expected || password !== expected) redirect("/login?error=1");

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(env.authSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const notSetUp = !env.sitePassword();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Dylan&apos;s Game Plan</h1>
      <p className="mt-1 text-muted">Enter the team password.</p>
      <form action={login} className="mt-6 flex flex-col gap-3">
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-line bg-card px-4 text-lg"
          placeholder="Password"
        />
        <button className="h-12 rounded-xl bg-accent text-lg font-semibold text-white">Let me in</button>
      </form>
      {error && <p className="mt-3 text-bad">That password didn&apos;t work.</p>}
      {notSetUp && <p className="mt-3 text-bad">SITE_PASSWORD isn&apos;t set in .env yet.</p>}
    </main>
  );
}
