import { NextRequest, NextResponse } from "next/server";

const REPO = "anusha626/lb-dashboard";
const FILE = "data/cash-log.json";
const GH   = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

export interface CashEntry {
  id: string;
  date: string;               // YYYY-MM-DD
  account: string;            // "PBB" | "MBB-1" | "MBB-2" | "CIMB" | "UOB"
  type: "In" | "Out" | "Balance";
  amount: number | null;      // for In / Out
  closingBalance: number | null;
  source: string;
  note: string;
  enteredBy: string;
  timestamp: string;          // ISO
}

interface FilePayload { entries: CashEntry[] }

async function ghHeaders(token: string) {
  return { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" };
}

async function readFile(token: string): Promise<{ entries: CashEntry[]; sha: string }> {
  const res = await fetch(GH, { headers: await ghHeaders(token), cache: "no-store" });
  if (res.status === 404) return { entries: [], sha: "" };
  if (!res.ok) throw new Error(`GitHub read ${res.status}`);
  const { content, sha } = await res.json() as { content: string; sha: string };
  const data = JSON.parse(Buffer.from(content, "base64").toString("utf-8")) as FilePayload;
  return { entries: data.entries ?? [], sha };
}

async function writeFile(token: string, sha: string, entries: CashEntry[], message: string) {
  const encoded = Buffer.from(JSON.stringify({ entries }, null, 2) + "\n").toString("base64");
  const res = await fetch(GH, {
    method: "PUT",
    headers: { ...(await ghHeaders(token)), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: encoded, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(err.message ?? "GitHub write failed");
  }
}

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ entries: [] });
  try {
    const { entries } = await readFile(token);
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });
  const body = await req.json() as { entries: CashEntry[] };
  if (!Array.isArray(body.entries) || !body.entries.length)
    return NextResponse.json({ error: "entries array required" }, { status: 400 });
  try {
    const { entries, sha } = await readFile(token);
    const merged = [...entries, ...body.entries];
    await writeFile(token, sha, merged, `cash: +${body.entries.length} entries`);
    return NextResponse.json({ ok: true, total: merged.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });
  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids)) return NextResponse.json({ error: "ids required" }, { status: 400 });
  try {
    const { entries, sha } = await readFile(token);
    const filtered = entries.filter((e) => !ids.includes(e.id));
    await writeFile(token, sha, filtered, `cash: remove ${ids.length} entries`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
