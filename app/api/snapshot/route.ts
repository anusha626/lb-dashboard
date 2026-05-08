import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchOrders, fetchProducts, getSalesperson, getOrderBranch, isPaidOrder } from "@/lib/easystore";
import { buildProductRowsLight } from "@/lib/transforms";

export interface SnapshotData {
  revenue: number;
  gp: number;
  gpPct: number;
  aov: number;
  orderCount: number;
  byBranch: { branch: string; revenue: number; count: number }[];
  leaderboard: { name: string; revenue: number; transactions: number }[];
  inventory: {
    active: number;
    aged30: number;
    aged60: number;
    aged90: number;
    aged90Value: number;
  };
}

async function computeSnapshot(from: string, to: string): Promise<SnapshotData> {
  const [orders, products] = await Promise.all([
    fetchOrders({
      created_at_min: `${from}T00:00:00+08:00`,
      created_at_max: `${to}T23:59:59+08:00`,
      status: "any",
    }),
    fetchProducts(),
  ]);

  let revenue = 0;
  let cost = 0;
  const branchMap = new Map<string, { revenue: number; count: number }>();
  const staffMap = new Map<string, { revenue: number; transactions: number }>();

  for (const order of orders) {
    if (!isPaidOrder(order)) continue; // skip pending / voided / refunded
    const orderRevenue = parseFloat(order.total_price) || 0;
    const orderCost = order.line_items.reduce(
      (s, li) => s + (parseFloat(li.cost_price ?? "0") || 0) * li.quantity,
      0
    );
    revenue += orderRevenue;
    cost += orderCost;

    const branch = getOrderBranch(order);
    const br = branchMap.get(branch) ?? { revenue: 0, count: 0 };
    br.revenue += orderRevenue;
    br.count += 1;
    branchMap.set(branch, br);

    const name = getSalesperson(order);
    if (name !== "Company Sale") {
      const sp = staffMap.get(name) ?? { revenue: 0, transactions: 0 };
      sp.revenue += orderRevenue;
      sp.transactions += 1;
      staffMap.set(name, sp);
    }
  }

  const gp = revenue - cost;
  const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
  const paidCount = Array.from(branchMap.values()).reduce((s, b) => s + b.count, 0);
  const aov = paidCount > 0 ? revenue / paidCount : 0;

  const byBranch = Array.from(branchMap.entries())
    .map(([branch, d]) => ({ branch, ...d }))
    .sort((a, b) => b.revenue - a.revenue);

  const leaderboard = Array.from(staffMap.entries())
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Inventory aging
  const today = new Date();
  const rows = buildProductRowsLight(products, today);
  const active = rows.filter((r) => r.status === "Active");
  const aged90 = active.filter((r) => r.daysToSell > 90);
  const aged60 = active.filter((r) => r.daysToSell > 60 && r.daysToSell <= 90);
  const aged30 = active.filter((r) => r.daysToSell > 30 && r.daysToSell <= 60);
  const aged90Value = aged90.reduce((s, r) => s + r.costPrice, 0);

  return {
    revenue,
    gp,
    gpPct,
    aov,
    orderCount: paidCount,
    byBranch,
    leaderboard,
    inventory: {
      active: active.length,
      aged30: aged30.length,
      aged60: aged60.length,
      aged90: aged90.length,
      aged90Value,
    },
  };
}

const getCachedSnapshot = unstable_cache(computeSnapshot, ["snapshot-current"], { revalidate: 300 });
const getCachedSnapshotPast = unstable_cache(computeSnapshot, ["snapshot-past"], { revalidate: 43200 });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = to < today
      ? await getCachedSnapshotPast(from, to)
      : await getCachedSnapshot(from, to);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
