import { NextRequest, NextResponse } from "next/server";
import staffConfig from "@/data/staff.json";

export interface StaffEntry {
  display: string;
  aliases: string[];
}

// GET — return current staff list
export async function GET() {
  return NextResponse.json(staffConfig as StaffEntry[]);
}

// POST — add a new staff member or alias, commit to GitHub → triggers Vercel redeploy
export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });

  const body = await req.json() as { display: string; aliases: string[] };
  if (!body.display || !body.aliases?.length) {
    return NextResponse.json({ error: "display and aliases required" }, { status: 400 });
  }

  // Merge with existing list
  const current = staffConfig as StaffEntry[];
  const existing = current.findIndex((s) => s.display.toLowerCase() === body.display.toLowerCase());
  let updated: StaffEntry[];
  if (existing >= 0) {
    // Merge aliases into existing entry
    const merged = Array.from(new Set([...current[existing].aliases, ...body.aliases.map((a) => a.toLowerCase())]));
    updated = current.map((s, i) => i === existing ? { ...s, aliases: merged } : s);
  } else {
    updated = [...current, { display: body.display, aliases: body.aliases.map((a) => a.toLowerCase()) }];
  }

  const newContent = JSON.stringify(updated, null, 2) + "\n";
  const encoded = Buffer.from(newContent).toString("base64");

  // Get current file SHA from GitHub
  const shaRes = await fetch(
    "https://api.github.com/repos/anusha626/lb-dashboard/contents/data/staff.json",
    { headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" } }
  );
  if (!shaRes.ok) return NextResponse.json({ error: "Failed to read file from GitHub" }, { status: 500 });
  const { sha } = await shaRes.json();

  // Commit updated file
  const commitRes = await fetch(
    "https://api.github.com/repos/anusha626/lb-dashboard/contents/data/staff.json",
    {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `staff: add/update ${body.display}`,
        content: encoded,
        sha,
      }),
    }
  );

  if (!commitRes.ok) {
    const err = await commitRes.json();
    return NextResponse.json({ error: err.message ?? "GitHub commit failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, staff: updated });
}
