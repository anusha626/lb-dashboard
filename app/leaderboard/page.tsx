"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import Nav from "@/components/Nav";
import type { LeaderboardData, StaffStats } from "@/app/api/leaderboard/route";

function formatRM(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Preset month helpers
function monthRange(date: Date) {
  return {
    from: format(startOfMonth(date), "yyyy-MM-dd"),
    to: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

const RANK_STYLES: Record<number, { ring: string; bg: string; num: string }> = {
  1: { ring: "#f59e0b", bg: "rgba(245,158,11,0.12)", num: "#f59e0b" },
  2: { ring: "#94a3b8", bg: "rgba(148,163,184,0.1)", num: "#94a3b8" },
  3: { ring: "#cd7c47", bg: "rgba(205,124,71,0.1)", num: "#cd7c47" },
};

function RankCard({ person }: { person: StaffStats }) {
  const style = RANK_STYLES[person.rank] ?? { ring: "var(--border)", bg: "var(--bg-card)", num: "var(--text-secondary)" };
  const isTop3 = person.rank <= 3;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 transition-all"
      style={{
        background: isTop3 ? style.bg : "var(--bg-card)",
        border: `1px solid ${isTop3 ? style.ring : "var(--border)"}`,
      }}
    >
      {/* Rank + name row */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: isTop3 ? style.ring : "var(--bg-base)",
            color: isTop3 ? "#fff" : "var(--text-secondary)",
          }}
        >
          {person.rank <= 3 ? ["🥇","🥈","🥉"][person.rank - 1] : `#${person.rank}`}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {person.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {person.branch}
          </div>
        </div>
        <div
          className="text-xs px-2 py-1 rounded-full font-medium shrink-0"
          style={{ background: "var(--bg-base)", color: isTop3 ? style.ring : "var(--text-secondary)" }}
        >
          {person.titleEmoji} {person.title}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center rounded-lg py-2"
          style={{ background: "var(--bg-base)" }}>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Revenue</span>
          <span className="font-bold text-sm mt-0.5" style={{ color: isTop3 ? style.ring : "var(--text-primary)" }}>
            {formatRM(person.revenue)}
          </span>
        </div>
        <div className="flex flex-col items-center rounded-lg py-2"
          style={{ background: "var(--bg-base)" }}>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Orders</span>
          <span className="font-bold text-sm mt-0.5" style={{ color: "var(--text-primary)" }}>
            {person.transactions}
          </span>
        </div>
        <div className="flex flex-col items-center rounded-lg py-2"
          style={{ background: "var(--bg-base)" }}>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Avg/order</span>
          <span className="font-bold text-sm mt-0.5" style={{ color: "var(--text-primary)" }}>
            {formatRM(person.avgOrderValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const now = new Date();
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(now, "yyyy-MM-dd")); // up to today
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leaderboard?from=${f}&to=${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(from, to); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(offset: number) {
    const target = subMonths(now, offset);
    const { from: f, to: t } = offset === 0
      ? { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") }
      : monthRange(target);
    setFrom(f);
    setTo(t);
    load(f, t);
  }

  const months = [
    { label: "This Month", offset: 0 },
    { label: "Last Month", offset: 1 },
    { label: "2 Months Ago", offset: 2 },
  ];

  const leader = data?.staff[0];

  return (
    <>
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Sales Leaderboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {data ? data.period : "Loading…"}
          </p>
        </div>

        {/* Period controls */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {months.map(({ label, offset }) => (
            <button
              key={label}
              onClick={() => applyPreset(offset)}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <input type="date" value={from} max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>to</span>
            <input type="date" value={to} min={from} max={format(now, "yyyy-MM-dd")}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
            <button onClick={() => load(from, to)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
              Apply
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading leaderboard…</span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl px-5 py-4 mb-6 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary banner */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl p-4 col-span-2 sm:col-span-1"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Total Revenue</div>
                <div className="text-2xl font-bold mt-1" style={{ color: "var(--accent)" }}>
                  {formatRM(data.totalRevenue)}
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Total Orders</div>
                <div className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{data.totalOrders}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Staff Active</div>
                <div className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{data.staff.length}</div>
              </div>
            </div>

            {/* Leader spotlight */}
            {leader && (
              <div className="rounded-xl p-5 mb-6 flex items-center gap-4"
                style={{ background: "rgba(245,158,11,0.08)", border: "2px solid #f59e0b" }}>
                <div className="text-4xl">👑</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: "#f59e0b" }}>
                    Top Closer · {data.period}
                  </div>
                  <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{leader.name}</div>
                  <div className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {formatRM(leader.revenue)} · {leader.transactions} orders · {leader.branch}
                  </div>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-3xl font-black" style={{ color: "#f59e0b" }}>
                    {formatRM(leader.revenue)}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>revenue</div>
                </div>
              </div>
            )}

            {/* Rankings */}
            {data.staff.length === 0 ? (
              <div className="rounded-xl px-5 py-12 text-center text-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                No sales data for this period
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.staff.map((person, i) => (
                  <RankCard key={person.name} person={person} />
                ))}
              </div>
            )}

            {/* Title legend */}
            <div className="mt-6 rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
                Title Guide
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { e: "👑", t: "Top Closer", d: "Rank #1 revenue" },
                  { e: "🥈", t: "Rising Star", d: "Rank #2 revenue" },
                  { e: "💪", t: "Consistent Closer", d: "10+ orders" },
                  { e: "🎯", t: "Keep Pushing", d: "Below 10 orders" },
                ].map(({ e, t, d }) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="text-base">{e}</span>
                    <div>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{t}</span>
                      <span className="text-xs ml-1.5" style={{ color: "var(--text-secondary)" }}>{d}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
