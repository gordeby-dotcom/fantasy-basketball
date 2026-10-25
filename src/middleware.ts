import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Every page needs the shared login, except the login page itself and the cron-triggered sync (which checks CRON_SECRET).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/sync")) return NextResponse.next();

  const secret = process.env.AUTH_SECRET || process.env.SITE_PASSWORD || "";
  const ok = await verifySessionToken(secret, req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
