"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";

interface StaffEntry {
  display: string;
  aliases: string[];
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Form state
  const [display, setDisplay] = useState("");
  const [aliases, setAliases] = useState("");

  async function fetchStaff() {
    setLoading(true);
    const res = await fetch("/api/staff");
    const data = await res.json();
    setStaff(data);
    setLoading(false);
  }

  useEffect(() => { fetchStaff(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!display.trim()) return;
    setSaving(true);
    setMsg(null);

    // Parse aliases: split by comma or newline
    const aliasList = aliases
      .split(/[,\n]/)
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    // Always include the display name lowercased as an alias
    if (!aliasList.includes(display.trim().toLowerCase())) {
      aliasList.unshift(display.trim().toLowerCase());
    }

    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display: display.trim(), aliases: aliasList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStaff(data.staff);
      setDisplay("");
      setAliases("");
      setMsg({ text: `✓ ${display.trim()} saved! Vercel is redeploying (~30s)…`, ok: true });
    } catch (err: unknown) {
      setMsg({ text: err instanceof Error ? err.message : "Save failed", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const card: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-base)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-secondary)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
    display: "block",
  };

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 16px 60px", color: "var(--text-primary)" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 400, margin: 0 }}>Salesperson List</h1>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Manage recognised names for leaderboard &amp; sales tracking
          </div>
        </div>

        {/* Add form */}
        <div style={card}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16, fontWeight: 500 }}>
            Add / Update Salesperson
          </div>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Display Name</label>
              <input
                style={inputStyle}
                placeholder="e.g. Sarah"
                value={display}
                onChange={(e) => setDisplay(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Aliases (comma-separated)</label>
              <input
                style={inputStyle}
                placeholder="e.g. sarah, sa sarah, sarah lbite"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 5 }}>
                Add all variations that appear in seller notes or tags. Case-insensitive.
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 20px",
                fontSize: 13,
                fontWeight: 500,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
                alignSelf: "flex-start",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {msg && (
              <div style={{ fontSize: 13, color: msg.ok ? "var(--green)" : "var(--red)", marginTop: -4 }}>
                {msg.text}
              </div>
            )}
          </form>
        </div>

        {/* Current list */}
        <div style={card}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16, fontWeight: 500 }}>
            Current Staff ({staff.length})
          </div>
          {loading ? (
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {staff.map((s, i) => (
                <div
                  key={s.display}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "11px 0",
                    borderBottom: i < staff.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div style={{ width: 120, fontWeight: 500, fontSize: 14, paddingTop: 1 }}>{s.display}</div>
                  <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {s.aliases.map((a) => (
                      <span
                        key={a}
                        style={{
                          background: "var(--bg-base)",
                          border: "1px solid var(--border)",
                          borderRadius: 99,
                          padding: "2px 10px",
                          fontSize: 11,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
