"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import type { SnapshotData } from "@/app/api/snapshot/route";

const fmtRM = (n: number) => "RM " + Math.round(n).toLocaleString();
const fmtPct = (n: number) => n.toFixed(1) + "%";
const ymd = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

const gpColor = (pct: number) =>
  pct >= 28 ? "var(--green)" : pct >= 20 ? "var(--amber)" : "var(--red)";

export default function SnapshotPage() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = new Date();
    const from = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
    const to = ymd(today);
    try {
      const res = await fetch(`/api/snapshot?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setRefreshedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  } as const;

  const titleStyle = {
    fontSize: 10,
    color: "var(--text-secondary)",
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    marginBottom: 14,
    fontWeight: 500,
  };

  const rowStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "9px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
  };

  const maxRev = data ? Math.max(...data.leaderboard.map((p) => p.revenue), 1) : 1;

  return (
    <>
    <Nav />
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px", color: "var(--text-primary)" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 300, letterSpacing: 0.5, margin: 0 }}>LBITE</h1>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>
          CEO Snapshot · {monthLabel}
        </div>
      </div>

      {loading && !data && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
          Loading the numbers…
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)", padding: 14, borderRadius: 10, fontSize: 12 }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Hero */}
          <div style={cardStyle}>
            <div style={titleStyle}>This Month</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 300, lineHeight: 1 }}>{fmtRM(data.revenue)}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", letterSpacing: 0.8, marginTop: 6, textTransform: "uppercase" }}>
                  Revenue · {data.orderCount} orders
                </div>
              </div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 300, lineHeight: 1, color: gpColor(data.gpPct) }}>{fmtPct(data.gpPct)}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", letterSpacing: 0.8, marginTop: 6, textTransform: "uppercase" }}>
                  GP · {fmtRM(data.gp)}
                </div>
              </div>
            </div>
            <div style={{ ...rowStyle, marginTop: 14, borderTop: "1px solid var(--border)", borderBottom: "none", paddingTop: 14 }}>
              <span style={{ color: "var(--text-secondary)" }}>Average Order Value</span>
              <span style={{ fontWeight: 500 }}>{fmtRM(data.aov)}</span>
            </div>
          </div>

          {/* Branch */}
          <div style={cardStyle}>
            <div style={titleStyle}>Branch Performance</div>
            {data.byBranch.filter((b) => b.branch !== "Unknown").map((b, i, arr) => (
              <div key={b.branch} style={{ ...rowStyle, borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                <span style={{ color: "var(--text-secondary)" }}>{b.branch}</span>
                <span style={{ fontWeight: 500 }}>{fmtRM(b.revenue)} · {b.count} orders</span>
              </div>
            ))}
          </div>

          {/* Top sales */}
          <div style={cardStyle}>
            <div style={titleStyle}>Top Sales · This Month</div>
            {data.leaderboard.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: "8px 0" }}>No sales yet this month</div>
            ) : (
              data.leaderboard.map((p) => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                  <div style={{ width: 110, fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ flex: 1, height: 6, background: "var(--bg-base)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(p.revenue / maxRev) * 100}%`, background: "var(--accent)", borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", width: 80, textAlign: "right" }}>{fmtRM(p.revenue)}</div>
                </div>
              ))
            )}
          </div>

          {/* Inventory health */}
          <div style={cardStyle}>
            <div style={titleStyle}>Inventory Health</div>
            <div style={rowStyle}>
              <span style={{ color: "var(--text-secondary)" }}>Active stock</span>
              <span style={{ fontWeight: 500 }}>{data.inventory.active} items</span>
            </div>
            <div style={rowStyle}>
              <span style={{ color: "var(--text-secondary)" }}>Aged 30–60 days</span>
              <span style={{ fontWeight: 500 }}>{data.inventory.aged30} items</span>
            </div>
            <div style={rowStyle}>
              <span style={{ color: "var(--text-secondary)" }}>Aged 60–90 days</span>
              <span style={{ fontWeight: 500 }}>{data.inventory.aged60} items</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: "none" }}>
              <span style={{ color: "var(--red)" }}>Aged 90+ days</span>
              <span style={{ fontWeight: 600, color: "var(--red)" }}>
                {data.inventory.aged90} items · {fmtRM(data.inventory.aged90Value)}
              </span>
            </div>
          </div>
        </>
      )}

      <button
        onClick={load}
        disabled={loading}
        style={{
          background: "var(--accent)",
          color: "white",
          border: "none",
          padding: "14px 20px",
          borderRadius: 99,
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: 0.5,
          width: "100%",
          marginTop: 6,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Refreshing…" : "↻ Refresh"}
      </button>

      {refreshedAt && (
        <div style={{ textAlign: "center", fontSize: 10, color: "var(--text-secondary)", marginTop: 14, letterSpacing: 0.5 }}>
          Last refreshed {refreshedAt.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
    </>
  );
}
