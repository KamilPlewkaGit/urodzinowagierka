import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "The Grand Table",
  description: "A private, casino-inspired team game with virtual chips.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
