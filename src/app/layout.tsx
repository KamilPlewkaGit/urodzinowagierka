import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Wielki Stół",
  description: "Prywatna gra drużynowa w kasynowym stylu z wirtualnymi żetonami.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
