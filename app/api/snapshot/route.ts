import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchGAS } from "@/lib/gas";
import type { GASSale, GASProduct } from "@/lib/gas";

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
  const [salesData, productsData] = await Promise.all([
    fetchGAS<{ sales: GASSale[] }>({ endpoint: "sales", from, to }, 300),
    fetchGAS<{ products: GASProduct[] }>({ endpoint: "products" }, 1800),
  ]);

  const sales = salesData.sales ?? [];
  const products = productsData.products ?? [];

  // Revenue / GP
  let revenue = 0;
  let gp = 0;
  const orderSet = new Set<string>();
  const branchMap = new Map<string, { revenue: number; count: number }>();
  const staffMap = new Map<string, { revenue: number; transactions: number }>();

  for (const s of sales) {
    const sell = Number(s.sell) || 0;
    const gpVal = Number(s.gp) || 0;
    revenue += sell;
    gp += gpVal;
    orderSet.add(s.order_number);

    const branch = s.branch || "Unknown";
    const br = branchMap.get(branch) ?? { revenue: 0, count: 0 };
    br.revenue += sell;
    br.count += 1;
    branchMap.set(branch, br);

    const person = s.sales_person || "Unknown";
    if (person !== "Company Sale") {
      const sp = staffMap.get(person) ?? { revenue: 0, transactions: 0 };
      sp.revenue += sell;
      sp.transactions += 1;
      staffMap.set(person, sp);
    }
  }

  const orderCount = orderSet.size || sales.length;
  const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  const byBranch = Array.from(branchMap.entries())
    .map(([branch, d]) => ({ branch, ...d }))
    .filter((b) => b.branch !== "Unknown")
    .sort((a, b) => b.revenue - a.revenue);

  const leaderboard = Array.from(staffMap.entries())
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Inventory aging from GAS products
  const activeProducts = products.filter((p) => {
    const statusLower = (p.status || "").toLowerCase();
    return !p.sold && (p.active || statusLower === "active");
  });

  const aged90 = activeProducts.filter((p) => Number(p.days_listed) > 90);
  const aged60 = activeProducts.filter((p) => Number(p.days_listed) > 60 && Number(p.days_listed) <= 90);
  const aged30 = activeProducts.filter((p) => Number(p.days_listed) > 30 && Number(p.days_listed) <= 60);
  const aged90Value = aged90.reduce((s, p) => s + (Number(p.cost) || 0), 0);

  return {
    revenue, gp, gpPct, aov, orderCount,
    byBranch, leaderboard,
    inventory: {
      active: activeProducts.length,
      aged30: aged30.length,
      aged60: aged60.length,
      aged90: aged90.length,
      aged90Value,
    },
  };
}

const getCachedSnapshot = unstable_cache(computeSnapshot, ["gas-snapshot-v1-current"], { revalidate: 300 });
const getCachedSnapshotPast = unstable_cache(computeSnapshot, ["gas-snapshot-v1-past"], { revalidate: 1800 });

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
