"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: "🏀" },
  { href: "/why", label: "Why", icon: "🔍" },
  { href: "/lineup", label: "Lineup", icon: "📋" },
  { href: "/games", label: "Games", icon: "📅" },
  { href: "/playoffs", label: "Playoffs", icon: "🏆" },
  { href: "/trade", label: "Trade", icon: "🔁" },
];

// Bottom tab bar on phones, top links on wider screens.
export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:pb-0">
      <ul className="mx-auto flex max-w-3xl justify-around sm:justify-start sm:gap-2">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1 sm:flex-none">
              <Link
                href={t.href}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium sm:h-10 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-4 sm:text-sm ${
                  active ? "text-accent sm:bg-accent-soft" : "text-muted"
                }`}
              >
                <span className="text-xl sm:text-base" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
