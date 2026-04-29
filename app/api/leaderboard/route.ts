import { NextRequest, NextResponse } from "next/server";
import { fetchOrders, getSalesperson, getOrderBranch } from "@/lib/easystore";

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
    const orders = await fetchOrders({
      created_at_min: `${from}T00:00:00+08:00`,
      created_at_max: `${to}T23:59:59+08:00`,
      status: "any",
    });

    const staffMap = new Map<string, { revenue: number; transactions: number; branches: Set<string> }>();

    let companySalesRevenue = 0;
    let companySalesCount = 0;

    for (const order of orders) {
      const name = getSalesperson(order);
      const revenue = parseFloat(order.total_price) || 0;

      // Company Sale — track separately, exclude from ranked leaderboard
      if (name === "Company Sale") {
        companySalesRevenue += revenue;
        companySalesCount += 1;
        continue;
      }

      const branch = getOrderBranch(order);
      const existing = staffMap.get(name) ?? { revenue: 0, transactions: 0, branches: new Set<string>() };
      existing.revenue += revenue;
      existing.transactions += 1;
      existing.branches.add(branch);
      staffMap.set(name, existing);
    }

    // Sort by revenue descending, assign ranks and titles
    const sorted = Array.from(staffMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue);

    const staff: StaffStats[] = sorted.map(([name, data], i) => {
      const rank = i + 1;
      const { emoji, title } = assignTitle(rank, data.transactions);
      const branchList = Array.from(data.branches).filter((b) => b !== "Unknown");
      return {
        name,
        revenue: data.revenue,
        transactions: data.transactions,
        avgOrderValue: data.transactions > 0 ? data.revenue / data.transactions : 0,
        branch: branchList.join(", ") || "Unknown",
        rank,
        title,
        titleEmoji: emoji,
      };
    });

    const staffRevenue = staff.reduce((s, p) => s + p.revenue, 0);
    const totalRevenue = staffRevenue + companySalesRevenue;

    // Format period label
    const fromDate = new Date(from + "T12:00:00");
    const toDate = new Date(to + "T12:00:00");
    const isSameMonth =
      fromDate.getMonth() === toDate.getMonth() &&
      fromDate.getFullYear() === toDate.getFullYear();
    const period = isSameMonth
      ? fromDate.toLocaleDateString("en-MY", { month: "long", year: "numeric" })
      : `${fromDate.toLocaleDateString("en-MY", { day: "numeric", month: "short" })} – ${toDate.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`;

    return {
      period,
      from,
      to,
      totalRevenue,
      totalOrders: orders.length,
      companySalesRevenue,
      companySalesCount,
      staff,
    };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  try {
    const data = await computeLeaderboard(from, to);
    return NextResponse.json(data satisfies LeaderboardData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
