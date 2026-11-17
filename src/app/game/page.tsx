import { redirect } from "next/navigation";

import { GameScreen } from "@/components/game-screen";
import { getGameSnapshot } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GamePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  const snapshot = await getGameSnapshot();
  if (snapshot.game.status === "waiting") redirect(session.role === "admin" ? "/admin" : "/lobby");

  return <GameScreen initialSnapshot={snapshot} viewerRole={session.role} />;
}
