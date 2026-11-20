import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ObserverScreen } from "@/components/observer-screen";
import { getGameSnapshot } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Widok obserwatora | Wielki Stół" };

export default async function ObserverPage() {
  const session = await getCurrentSession();
  if (session?.role !== "observer") redirect("/");

  return <ObserverScreen initialSnapshot={await getGameSnapshot()} />;
}
