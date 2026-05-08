import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchGAS } from "@/lib/gas";
import type { GASSale } from "@/lib/gas";

function escapeCsv(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function monthYear(dateStr: string): string {
  // dateStr expected as "YYYY-MM-DD" or "DD/MM/YYYY"
  try {
    let y: string, m: string;
    if (dateStr.match(/^\d{4}-\d{2}/)) {
      [y, m] = dateStr.split("-");
    } else {
      const parts = dateStr.split("/");
      m = parts[1]; y = parts[2];
    }
    const d = new Date(`${y}-${m.padStart(2, "0")}-01T12:00:00`);
    return d.toLocaleDateString("en-MY", { month: "short", year: "numeric" }).replace(" ", "-");
  } catch {
    return dateStr;
  }
}

async function computeSalesRows(from: string, to: string): Promise<Record<string, string>[]> {
  const data = await fetchGAS<{ sales: GASSale[] }>(
    { endpoint: "sales", from, to },
    300
  );
  const sales = data.sales ?? [];

  return sales.map((s) => ({
    Order_ID: s.order_number ?? "",
    Order_Date: s.date ?? "",
    Month_Year: monthYear(s.date ?? ""),
    Salesperson: s.sales_person ?? "",
    Customer: s.customer ?? "",
    Location: s.branch ?? "",
    Product_SKU: s.sku ?? "",
    Item: s.item ?? "",
    Sale_Price: String(Number(s.sell || 0).toFixed(2)),
    Cost: String(Number(s.cost || 0).toFixed(2)),
    GP: String(Number(s.gp || 0).toFixed(2)),
    Margin_Pct: String(Number(s.margin_pct || 0).toFixed(1)),
    Channel: s.channel ?? "",
    Transaction_Type: s.payment ?? "",
  }));
}

const getCachedRows = unstable_cache(computeSalesRows, ["gas-sales-v1-current"], { revalidate: 300 });
const getCachedRowsPast = unstable_cache(computeSalesRows, ["gas-sales-v1-past"], { revalidate: 1800 });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const asJson = searchParams.get("format") === "json";
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = to < today
      ? await getCachedRowsPast(from, to)
      : await getCachedRows(from, to);

    if (asJson) return NextResponse.json({ rows, count: rows.length });

    const headers = ["Order_ID","Order_Date","Month_Year","Salesperson","Customer","Location","Product_SKU","Item","Sale_Price","Cost","GP","Margin_Pct","Channel","Transaction_Type"];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(",")),
    ];
    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="LB_Sales_${from}_to_${to}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
