"use client";

import { useEffect, useState, useMemo } from "react";
import Nav from "@/components/Nav";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ─── Constants ─────────────────────────────────────────────────────────── */

const ACCOUNTS = ["PBB", "MBB-1", "MBB-2", "CIMB", "UOB"] as const;
type Acct = (typeof ACCOUNTS)[number];

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface CashEntry {
  id: string;
  date: string;
  account: string;
  type: "In" | "Out" | "Balance";
  amount: number | null;
  closingBalance: number | null;
  source: string;
  note: string;
  enteredBy: string;
  timestamp: string;
}

interface QuickRow {
  account: Acct;
  closingBalance: string;
  inflow: string;
  outflow: string;
  note: string;
  sameAsYesterday: boolean;
}

/* ─── Formatting ─────────────────────────────────────────────────────────── */

const rm = (n: number | null | undefined, decimals = 2) =>
  n == null || isNaN(n as number)
    ? "—"
    : `RM ${(n as number).toLocaleString("en-MY", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const shortK = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000
    ? `${(v / 1_000).toFixed(0)}K`
    : v.toFixed(0);

/* ─── Date helpers ───────────────────────────────────────────────────────── */

const todayISO = () => new Date().toISOString().slice(0, 10);
const nAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const daysBetween = (a: string, b: string) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

/* ─── Data helpers ───────────────────────────────────────────────────────── */

function sorted(entries: CashEntry[], acct: string) {
  return entries
    .filter((e) => e.account === acct)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp));
}

function balanceAsOf(entries: CashEntry[], acct: string, date: string): number | null {
  const rows = sorted(entries, acct).filter((e) => e.date <= date);
  for (let i = rows.length - 1; i >= 0; i--)
    if (rows[i].closingBalance !== null) return rows[i].closingBalance;
  return null;
}

function latest(entries: CashEntry[], acct: string) {
  const rows = sorted(entries, acct);
  for (let i = rows.length - 1; i >= 0; i--)
    if (rows[i].closingBalance !== null)
      return { balance: rows[i].closingBalance as number, date: rows[i].date };
  return { balance: null as number | null, date: null as string | null };
}

function sparkValues(entries: CashEntry[], acct: string, days = 14): number[] {
  const out: number[] = [];
  let carry: number | null = null;
  for (let i = days - 1; i >= 0; i--) {
    const b = balanceAsOf(entries, acct, nAgo(i));
    if (b !== null) carry = b;
    if (carry !== null) out.push(carry);
  }
  return out;
}

function flowData(entries: CashEntry[], days = 14) {
  return Array.from({ length: days }, (_, idx) => {
    const i = days - 1 - idx;
    const date = nAgo(i);
    const [, m, d] = date.split("-");
    const label = `${d}/${m}`;

    const dayE = entries.filter((e) => e.date === date);
    let inflow = 0, outflow = 0, hasIO = false;
    for (const e of dayE) {
      if (e.type === "In" && e.amount) { inflow += e.amount; hasIO = true; }
      if (e.type === "Out" && e.amount) { outflow += e.amount; hasIO = true; }
    }
    if (!hasIO) {
      let tot = 0, prev = 0, hT = false, hP = false;
      for (const a of ACCOUNTS) {
        const t = balanceAsOf(entries, a, date);
        const p = balanceAsOf(entries, a, nAgo(i + 1));
        if (t !== null) { tot += t; hT = true; }
        if (p !== null) { prev += p; hP = true; }
      }
      if (hT && hP) {
        const d2 = tot - prev;
        if (d2 > 0) inflow = d2; else outflow = -d2;
      }
    }
    return { date, label, inflow, outflow };
  });
}

/* ─── Sparkline ──────────────────────────────────────────────────────────── */

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span style={{ color: "var(--text-secondary)" }}>—</span>;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 72, H = 22;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - ((v - min) / range) * (H - 4)}`)
    .join(" ");
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Delta badge ────────────────────────────────────────────────────────── */

function Delta({ val, pct }: { val: number | null; pct: number | null }) {
  if (val === null) return <div className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>—</div>;
  const up = val >= 0;
  const c = up ? "#22c55e" : "#ef4444";
  return (
    <>
      <div className="text-lg font-bold leading-tight" style={{ color: c }}>
        {up ? "↑" : "↓"} {rm(Math.abs(val), 0)}
      </div>
      {pct !== null && (
        <div className="text-xs mt-0.5" style={{ color: c }}>
          {up ? "+" : ""}{pct.toFixed(1)}%
        </div>
      )}
    </>
  );
}

/* ─── Shared styles ──────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px 20px",
};

const TH: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
};

const inputSt: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  padding: "7px 10px",
  fontSize: 13,
  width: "100%",
  outline: "none",
};

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════════════ */

export default function CashPage() {
  type Tab = "dashboard" | "entry" | "log";
  const [tab, setTab] = useState<Tab>("dashboard");
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [entryDate, setEntryDate] = useState(todayISO());
  const [quickRows, setQuickRows] = useState<QuickRow[]>(
    ACCOUNTS.map((a) => ({
      account: a,
      closingBalance: "",
      inflow: "",
      outflow: "",
      note: "",
      sameAsYesterday: a === "UOB",
    }))
  );
  const [warnings, setWarnings] = useState<Record<string, string>>({});

  const [logAcct, setLogAcct] = useState("All");
  const [logSearch, setLogSearch] = useState("");

  useEffect(() => {
    setMounted(true);
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/cash");
      const j = await r.json() as { entries: CashEntry[] };
      setEntries(j.entries ?? []);
    } finally {
      setLoading(false);
    }
  }

  /* ── Computed ────────────────────────────────────────────────────────── */

  const today = todayISO();
  const ago7  = nAgo(7);
  const ms    = monthStart();

  const acctRows = useMemo(() =>
    ACCOUNTS.map((a) => {
      const { balance, date } = latest(entries, a);
      const b7 = balanceAsOf(entries, a, ago7);
      const net7 = balance !== null && b7 !== null ? balance - b7 : null;
      const stale = date !== null && daysBetween(date, today) > 3;
      return { account: a, balance, date, net7, stale, spark: sparkValues(entries, a) };
    }),
  [entries, today, ago7]);

  const totalToday = useMemo(
    () => acctRows.reduce((s, r) => s + (r.balance ?? 0), 0),
    [acctRows]
  );
  const total7ago = useMemo(
    () => ACCOUNTS.reduce((s, a) => s + (balanceAsOf(entries, a, ago7) ?? 0), 0),
    [entries, ago7]
  );
  const totalMS = useMemo(
    () => ACCOUNTS.reduce((s, a) => s + (balanceAsOf(entries, a, ms) ?? 0), 0),
    [entries, ms]
  );
  const lastUpdated = useMemo(() => {
    if (!entries.length) return null;
    return entries.reduce((best, e) => (e.timestamp > best ? e.timestamp : best), entries[0].timestamp);
  }, [entries]);

  const chartData = useMemo(() => flowData(entries), [entries]);

  const hasAnyBalance = acctRows.some((r) => r.balance !== null);
  const delta7    = total7ago > 0 ? totalToday - total7ago : null;
  const delta7pct = total7ago > 0 ? ((totalToday - total7ago) / total7ago) * 100 : null;
  const deltaMS   = totalMS   > 0 ? totalToday - totalMS   : null;
  const deltaMSpct= totalMS   > 0 ? ((totalToday - totalMS)   / totalMS)   * 100 : null;

  /* ── Quick-entry helpers ─────────────────────────────────────────────── */

  function updateRow(idx: number, patch: Partial<QuickRow>) {
    setQuickRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function runValidation() {
    const w: Record<string, string> = {};
    for (const row of quickRows) {
      if (row.sameAsYesterday || !row.closingBalance.trim()) continue;
      const closing = parseFloat(row.closingBalance);
      if (isNaN(closing)) { w[row.account] = "Invalid amount"; continue; }
      const prev = balanceAsOf(entries, row.account, nAgo(1));
      if (prev !== null && (row.inflow || row.outflow)) {
        const inf = parseFloat(row.inflow) || 0;
        const out = parseFloat(row.outflow) || 0;
        const expected = prev + inf - out;
        if (Math.abs(closing - expected) > 10)
          w[row.account] = `Expected ≈ ${rm(expected)} (diff ${rm(Math.abs(closing - expected), 0)})`;
      }
    }
    setWarnings(w);
  }

  async function handleSubmit() {
    runValidation();
    const now = new Date().toISOString();
    const newEntries: CashEntry[] = [];

    for (const row of quickRows) {
      const uid = () => `${Date.now()}-${row.account}-${Math.random().toString(36).slice(2, 7)}`;

      if (row.sameAsYesterday) {
        const { balance } = latest(entries, row.account);
        if (balance !== null)
          newEntries.push({
            id: uid(), date: entryDate, account: row.account,
            type: "Balance", amount: null, closingBalance: balance,
            source: "Quick Entry", note: "Same as yesterday", enteredBy: "", timestamp: now,
          });
        continue;
      }

      if (!row.closingBalance.trim()) continue;
      const closing = parseFloat(row.closingBalance);
      if (isNaN(closing)) continue;

      const inf = parseFloat(row.inflow);
      const out = parseFloat(row.outflow);
      if (!isNaN(inf) && inf > 0)
        newEntries.push({
          id: uid(), date: entryDate, account: row.account,
          type: "In", amount: inf, closingBalance: null,
          source: "Quick Entry", note: row.note, enteredBy: "", timestamp: now,
        });
      if (!isNaN(out) && out > 0)
        newEntries.push({
          id: uid(), date: entryDate, account: row.account,
          type: "Out", amount: out, closingBalance: null,
          source: "Quick Entry", note: row.note, enteredBy: "", timestamp: now,
        });
      newEntries.push({
        id: uid(), date: entryDate, account: row.account,
        type: "Balance", amount: null, closingBalance: closing,
        source: "Quick Entry", note: row.note, enteredBy: "", timestamp: now,
      });
    }

    if (!newEntries.length) { setSaveMsg("Nothing to save — fill at least one row."); return; }

    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch("/api/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: newEntries }),
      });
      const j = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setSaveMsg(`✅ Saved ${newEntries.length} entries`);
      await load();
      setQuickRows(ACCOUNTS.map((a) => ({
        account: a, closingBalance: "", inflow: "", outflow: "", note: "", sameAsYesterday: a === "UOB",
      })));
      setWarnings({});
    } catch (e) {
      setSaveMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  /* ── Cash log filter ─────────────────────────────────────────────────── */

  const filteredLog = useMemo(() => {
    const q = logSearch.toLowerCase();
    return entries
      .filter((e) => {
        if (logAcct !== "All" && e.account !== logAcct) return false;
        if (q) return e.note.toLowerCase().includes(q) || e.date.includes(q) || e.account.toLowerCase().includes(q);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp));
  }, [entries, logAcct, logSearch]);

  /* ── Sub-tab pill ────────────────────────────────────────────────────── */

  const pill = (key: Tab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
        border: "none", cursor: "pointer", transition: "all .15s",
        background: tab === key ? "var(--accent)" : "transparent",
        color: tab === key ? "#fff" : "var(--text-secondary)",
      }}
    >{label}</button>
  );

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>💰 Daily Cash Position</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              PBB · MBB-1 · MBB-2 · CIMB · UOB — MYR, manual entry
            </p>
          </div>
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {pill("dashboard", "📊 Dashboard")}
            {pill("entry",     "✏️ Quick Entry")}
            {pill("log",       "📋 Cash Log")}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading…</span>
          </div>
        )}

        {!loading && (
          <>

            {/* ══════════════════════════════ DASHBOARD ══════════════════════════════ */}
            {tab === "dashboard" && (
              <div className="flex flex-col gap-5">

                {/* Section A — Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div style={card}>
                    <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Total Cash Today</div>
                    <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                      {hasAnyBalance ? rm(totalToday, 2) : "—"}
                    </div>
                  </div>
                  <div style={card}>
                    <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Δ vs 7 Days Ago</div>
                    <Delta val={delta7} pct={delta7pct} />
                  </div>
                  <div style={card}>
                    <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Δ vs Month Start</div>
                    <Delta val={deltaMS} pct={deltaMSpct} />
                  </div>
                  <div style={card}>
                    <div className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Last Updated</div>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {lastUpdated
                        ? new Date(lastUpdated).toLocaleString("en-MY", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Section B — Per-account table */}
                <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                  <div className="px-5 py-3 text-sm font-semibold"
                    style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}>
                    Account Balances
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--border)" }}>
                          <th style={TH}>Account</th>
                          <th style={{ ...TH, textAlign: "right" }}>Latest Balance</th>
                          <th style={TH}>As Of</th>
                          <th style={{ ...TH, textAlign: "right" }}>7-Day Net</th>
                          <th style={TH}>14-Day Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acctRows.map((r, i) => (
                          <tr key={r.account}
                            style={{ borderBottom: i < ACCOUNTS.length - 1 ? "1px solid var(--border)" : "none" }}
                            className="transition-colors hover:bg-[var(--bg-card-hover)]">
                            <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>
                              {r.account}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold"
                              style={{ color: "var(--text-primary)" }}>
                              {rm(r.balance)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              {r.date ? (
                                <span style={{ color: r.stale ? "#f59e0b" : "var(--text-secondary)", fontWeight: r.stale ? 600 : 400 }}>
                                  {fmtDate(r.date)}{r.stale ? " ⚠" : ""}
                                </span>
                              ) : (
                                <span style={{ color: "var(--text-secondary)" }}>No data</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm"
                              style={{ color: r.net7 === null ? "var(--text-secondary)" : r.net7 >= 0 ? "#22c55e" : "#ef4444" }}>
                              {r.net7 === null ? "—" : `${r.net7 >= 0 ? "+" : ""}${rm(r.net7, 0)}`}
                            </td>
                            <td className="px-4 py-3">
                              <Sparkline values={r.spark} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section C — 14-day bar chart */}
                <div style={card}>
                  <div className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    14-Day Cash Flow
                  </div>
                  {mounted ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData} barCategoryGap="30%">
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" as string }}
                          axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" as string }}
                          axisLine={false} tickLine={false} tickFormatter={shortK} width={48} />
                        <Tooltip
                          contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: number, name: string) => [rm(v), name === "inflow" ? "Inflow" : "Outflow"]}
                        />
                        <Bar dataKey="inflow"  name="inflow"  fill="#22c55e" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="outflow" name="outflow" fill="#ef4444" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm"
                      style={{ color: "var(--text-secondary)" }}>Loading chart…</div>
                  )}
                  <div className="flex gap-4 mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span><span style={{ color: "#22c55e" }}>■</span> Inflow</span>
                    <span><span style={{ color: "#ef4444" }}>■</span> Outflow / Net-down</span>
                    <span className="ml-auto italic">Balance-only entries shown as implied net change</span>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════ QUICK ENTRY ══════════════════════════════ */}
            {tab === "entry" && (
              <div style={{ ...card }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Quick Entry — End-of-Day Balances
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      Leave any row blank to skip. UOB defaults to previous balance.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Date</label>
                    <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
                      style={{ ...inputSt, width: "auto", padding: "6px 10px" }} />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={TH}>Account</th>
                        <th style={TH}>Closing Balance (RM) *</th>
                        <th style={TH}>Inflow (opt)</th>
                        <th style={TH}>Outflow (opt)</th>
                        <th style={TH}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quickRows.map((row, idx) => {
                        const prev = latest(entries, row.account);
                        return (
                          <tr key={row.account} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td className="px-3 py-3 min-w-[80px]">
                              <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{row.account}</div>
                              {prev.balance !== null && (
                                <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                  {rm(prev.balance, 2)} ({fmtDate(prev.date ?? "")})
                                </div>
                              )}
                            </td>

                            {/* Closing balance / UOB checkbox */}
                            <td className="px-3 py-3 min-w-[180px]">
                              {row.account === "UOB" ? (
                                <div>
                                  <label className="flex items-center gap-2 text-xs cursor-pointer"
                                    style={{ color: "var(--text-secondary)" }}>
                                    <input type="checkbox" checked={row.sameAsYesterday}
                                      onChange={(e) => updateRow(idx, { sameAsYesterday: e.target.checked, closingBalance: "" })} />
                                    Same as yesterday
                                  </label>
                                  {!row.sameAsYesterday && (
                                    <input type="number" placeholder="0.00" value={row.closingBalance}
                                      onChange={(e) => updateRow(idx, { closingBalance: e.target.value })}
                                      style={{ ...inputSt, marginTop: 6 }} />
                                  )}
                                </div>
                              ) : (
                                <input type="number" placeholder="0.00" value={row.closingBalance}
                                  onChange={(e) => updateRow(idx, { closingBalance: e.target.value })}
                                  style={inputSt} />
                              )}
                              {warnings[row.account] && (
                                <div className="text-xs mt-1" style={{ color: "#f59e0b" }}>
                                  ⚠ {warnings[row.account]}
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-3 min-w-[120px]">
                              <input type="number" placeholder="—" value={row.inflow}
                                onChange={(e) => updateRow(idx, { inflow: e.target.value })}
                                style={{ ...inputSt, opacity: row.sameAsYesterday ? 0.4 : 1 }}
                                disabled={row.sameAsYesterday} />
                            </td>
                            <td className="px-3 py-3 min-w-[120px]">
                              <input type="number" placeholder="—" value={row.outflow}
                                onChange={(e) => updateRow(idx, { outflow: e.target.value })}
                                style={{ ...inputSt, opacity: row.sameAsYesterday ? 0.4 : 1 }}
                                disabled={row.sameAsYesterday} />
                            </td>
                            <td className="px-3 py-3 min-w-[160px]">
                              <input type="text" placeholder="Optional note" value={row.note}
                                onChange={(e) => updateRow(idx, { note: e.target.value })}
                                style={{ ...inputSt, opacity: row.sameAsYesterday ? 0.4 : 1 }}
                                disabled={row.sameAsYesterday} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3 mt-5 pt-4"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    * Primary mode: enter closing balance from screenshot. Inflow/Outflow optional for audit trail.
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {saveMsg && (
                      <span className="text-sm" style={{ color: saveMsg.startsWith("✅") ? "#22c55e" : "#ef4444" }}>
                        {saveMsg}
                      </span>
                    )}
                    <button onClick={handleSubmit} disabled={saving}
                      className="px-5 py-2 rounded-lg text-sm font-semibold transition-opacity"
                      style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1, border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
                      {saving ? "Saving…" : "Submit Today's Entries"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════ CASH LOG ═══════════════════════════════ */}
            {tab === "log" && (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                {/* Filters */}
                <div className="flex flex-wrap gap-2 p-4" style={{ borderBottom: "1px solid var(--border)" }}>
                  <input type="text" placeholder="Search date, note…" value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-2 rounded-lg text-sm"
                    style={{ ...inputSt, width: "auto" }} />
                  <select value={logAcct} onChange={(e) => setLogAcct(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ ...inputSt, width: "auto", colorScheme: "dark" }}>
                    <option value="All">All Accounts</option>
                    {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <span className="text-xs self-center" style={{ color: "var(--text-secondary)" }}>
                    {filteredLog.length} entries
                  </span>
                </div>

                {filteredLog.length === 0 ? (
                  <div className="py-16 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                    {entries.length === 0
                      ? "No entries yet — use Quick Entry to add your first balances."
                      : "No matching entries."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--border)" }}>
                          <th style={TH}>Date</th>
                          <th style={TH}>Account</th>
                          <th style={TH}>Type</th>
                          <th style={{ ...TH, textAlign: "right" }}>Amount</th>
                          <th style={{ ...TH, textAlign: "right" }}>Closing Balance</th>
                          <th style={TH}>Note</th>
                          <th style={TH}>Entered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLog.map((e, i) => {
                          const typeColor = e.type === "In" ? "#22c55e" : e.type === "Out" ? "#ef4444" : "var(--text-secondary)";
                          const typeBg   = e.type === "In" ? "rgba(34,197,94,.12)" : e.type === "Out" ? "rgba(239,68,68,.12)" : "rgba(148,163,184,.12)";
                          return (
                            <tr key={e.id}
                              style={{ borderBottom: i < filteredLog.length - 1 ? "1px solid var(--border)" : "none" }}
                              className="transition-colors hover:bg-[var(--bg-card-hover)]">
                              <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
                                {fmtDate(e.date)}
                              </td>
                              <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>
                                {e.account}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{ color: typeColor, background: typeBg }}>
                                  {e.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                                {e.amount !== null ? rm(e.amount) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                                {rm(e.closingBalance)}
                              </td>
                              <td className="px-4 py-3 max-w-[200px] truncate text-sm"
                                style={{ color: "var(--text-secondary)" }} title={e.note}>
                                {e.note || "—"}
                              </td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                                {new Date(e.timestamp).toLocaleString("en-MY", {
                                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                                })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </main>
    </>
  );
}
