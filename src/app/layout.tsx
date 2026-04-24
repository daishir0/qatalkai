import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QATalkAI",
  description: "アウトバウンド電話アンケート・商材訴求システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
