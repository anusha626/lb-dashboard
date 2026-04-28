import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LB International — Sales Dashboard",
  description: "Internal sales dashboard for LB International",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col" style={{ backgroundColor: "var(--bg-base)", color: "var(--text-primary)" }}>
        {children}
      </body>
    </html>
  );
}
