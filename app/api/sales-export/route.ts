import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchOrders, getSalesperson, getOrderBranch, getCustomerName } from "@/lib/easystore";
import { extractBrand } from "@/lib/transforms";
import { format, parseISO } from "date-fns";

function getChannel(sourceName: string | null): string {
  const map: Record<string, string> = {
    pos:       "Walk-in",
    cp:        "ChatDaddy / WhatsApp",
    web:       "Online Website",
    mobile:    "Mobile App",
    instagram: "Instagram",
  };
  return map[sourceName ?? ""] ?? sourceName ?? "Unknown";
}

function getTransactionType(note: string | null): string {
  const n = (note ?? "").toLowerCase();
  if (n.includes("consign")) return "Consignment Sale";
  return "Cash Buy Sale";
}

function escapeCsv(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HQ_LOCATION_ID = 226632; // LBITE Luxury Branded HQ

async function computeSalesRows(from: string, to: string): Promise<Record<string, string>[]> {
  const orders = await fetchOrders({
    created_at_min: `${from}T00:00:00+08:00`,
    created_at_max: `${to}T23:59:59+08:00`,
    status: "any",
  });

  const rows: Record<string, string>[] = [];

  for (const order of orders) {
    const salesperson = getSalesperson(order);
    const location = getOrderBranch(order);
    const customerName = getCustomerName(order);
    const channel = getChannel(order.source_name);
    const txType = getTransactionType(order.note);
    const orderDate = format(parseISO(order.created_at), "yyyy-MM-dd");
    const monthYear = format(parseISO(order.created_at), "MMM-yyyy");

    if (order.line_items.length === 0) {
      rows.push({
        Order_ID: order.order_number,
        Order_Date: orderDate,
        Month_Year: monthYear,
        Salesperson: salesperson,
        Customer: customerName,
        Location: location,
        Product_SKU: "",
        Quantity: "",
        Sale_Price: order.total_price,
        Channel: channel,
        Transaction_Type: txType,
      });
    } else {
      const subtotal = order.line_items.reduce(
        (s, li) => s + (parseFloat(li.price) || 0) * li.quantity, 0
      );
      const totalPaid = parseFloat(order.total_price) || 0;
      const ratio = subtotal > 0 ? totalPaid / subtotal : 1;

      for (const item of order.line_items) {
        const proratedPrice = ((parseFloat(item.price) || 0) * item.quantity * ratio).toFixed(2);
        const hqQty = item.fulfillment_order_location_id === HQ_LOCATION_ID ? String(item.quantity) : "";
        rows.push({
          Order_ID: order.order_number,
          Order_Date: orderDate,
          Month_Year: monthYear,
          Salesperson: salesperson,
          Customer: customerName,
          Location: location,
          Product_SKU: item.sku,
          Quantity: hqQty,
          Sale_Price: proratedPrice,
          Channel: channel,
          Transaction_Type: txType,
        });
      }
    }
  }

  return rows;
}

// 5 min for current period, 12 hours for completed past periods
const getCachedRows = unstable_cache(computeSalesRows, ["sales-export-current-v4"], { revalidate: 300 });
const getCachedRowsPast = unstable_cache(computeSalesRows, ["sales-export-past-v4"], { revalidate: 43200 });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const asJson = searchParams.get("format") === "json";

  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = to < today
      ? await getCachedRowsPast(from, to)
      : await getCachedRows(from, to);

    if (asJson) {
      return NextResponse.json({ rows, count: rows.length });
    }

    const headers = ["Order_ID","Order_Date","Month_Year","Salesperson","Customer","Location","Product_SKU","Quantity","Sale_Price","Channel","Transaction_Type"];
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
