import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { getGameSnapshot } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") redirect("/");

  return <AdminDashboard initialSnapshot={await getGameSnapshot()} />;
}
