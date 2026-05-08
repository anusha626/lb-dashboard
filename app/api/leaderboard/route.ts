import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchGAS } from "@/lib/gas";
import type { GASLeaderboardEntry } from "@/lib/gas";

export interface StaffStats {
  name: string;
  revenue: number;
  transactions: number;
  avgOrderValue: number;
  branch: string;
  rank: number;
  title: string;
  titleEmoji: string;
}

export interface LeaderboardData {
  period: string;
  from: string;
  to: string;
  totalRevenue: number;
  totalOrders: number;
  companySalesRevenue: number;
  companySalesCount: number;
  staff: StaffStats[];
}

function assignTitle(rank: number, transactions: number): { title: string; emoji: string } {
  if (rank === 1) return { emoji: "👑", title: "Top Closer" };
  if (rank === 2) return { emoji: "🥈", title: "Rising Star" };
  if (transactions >= 10) return { emoji: "💪", title: "Consistent Closer" };
  return { emoji: "🎯", title: "Keep Pushing" };
}

async function computeLeaderboard(from: string, to: string): Promise<LeaderboardData> {
  const data = await fetchGAS<{ leaderboard: GASLeaderboardEntry[] }>(
    { endpoint: "leaderboard", from, to },
    300
  );
  const entries = data.leaderboard ?? [];

  // Separate company sales
  const companySalesEntries = entries.filter(
    (e) => e.sales_person?.toLowerCase() === "company sale"
  );
  const staffEntries = entries.filter(
    (e) => e.sales_person?.toLowerCase() !== "company sale"
  );

  const companySalesRevenue = companySalesEntries.reduce((s, e) => s + Number(e.revenue), 0);
  const companySalesCount = companySalesEntries.reduce((s, e) => s + Number(e.sales_count), 0);

  const sorted = [...staffEntries].sort((a, b) => Number(b.revenue) - Number(a.revenue));

  const staff: StaffStats[] = sorted.map((e, i) => {
    const rank = i + 1;
    const { emoji, title } = assignTitle(rank, Number(e.sales_count));
    return {
      name: e.sales_person,
      revenue: Number(e.revenue),
      transactions: Number(e.sales_count),
      avgOrderValue: Number(e.aov),
      branch: "—",
      rank,
      title,
      titleEmoji: emoji,
    };
  });

  const staffRevenue = staff.reduce((s, p) => s + p.revenue, 0);
  const totalRevenue = staffRevenue + companySalesRevenue;
  const totalOrders = staff.reduce((s, p) => s + p.transactions, 0) + companySalesCount;

  // Period label
  const fromDate = new Date(from + "T12:00:00");
  const toDate = new Date(to + "T12:00:00");
  const isSameMonth =
    fromDate.getMonth() === toDate.getMonth() &&
    fromDate.getFullYear() === toDate.getFullYear();
  const period = isSameMonth
    ? fromDate.toLocaleDateString("en-MY", { month: "long", year: "numeric" })
    : `${fromDate.toLocaleDateString("en-MY", { day: "numeric", month: "short" })} – ${toDate.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`;

  return {
    period, from, to,
    totalRevenue, totalOrders,
    companySalesRevenue, companySalesCount,
    staff,
  };
}

const getCachedLeaderboard = unstable_cache(computeLeaderboard, ["gas-leaderboard-v1-current"], { revalidate: 300 });
const getCachedLeaderboardPast = unstable_cache(computeLeaderboard, ["gas-leaderboard-v1-past"], { revalidate: 1800 });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = to < today
      ? await getCachedLeaderboardPast(from, to)
      : await getCachedLeaderboard(from, to);
    return NextResponse.json(data satisfies LeaderboardData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
