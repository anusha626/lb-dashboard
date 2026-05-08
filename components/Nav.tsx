"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();

  const links = [
    { href: "/leaderboard", label: "🏆 Leaderboard" },
    { href: "/products", label: "Products" },
    { href: "/sales", label: "Sales Data" },
    { href: "/snapshot", label: "📊 Snapshot" },
    { href: "/staff", label: "👤 Staff" },
  ];

  return (
    <nav
      style={{
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
      }}
      className="sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: "var(--accent)" }}
          >
            LB
          </div>
          <span className="font-semibold text-sm hidden sm:block" style={{ color: "var(--text-primary)" }}>
            LB International
          </span>
        </div>

        {/* Nav links */}
        <div className="flex gap-1">
          {links.map(({ href, label }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--accent-glow)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  border: active ? "1px solid var(--accent)" : "1px solid transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
