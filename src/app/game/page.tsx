import { redirect } from "next/navigation";

import { AdminGamePreview } from "@/components/game-session";
import { getGameSnapshot } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GamePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  if (session.role === "player") redirect("/lobby?widok=segment");

  const snapshot = await getGameSnapshot();
  if (snapshot.game.status === "waiting") redirect("/admin");

  return <AdminGamePreview initialSnapshot={snapshot} />;
}
