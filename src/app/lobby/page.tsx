import { redirect } from "next/navigation";

import { LobbyClient } from "@/components/lobby-client";
import { getGameSnapshot, getPlayer } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "player") redirect("/");

  const [player, snapshot] = await Promise.all([getPlayer(session.playerId), getGameSnapshot()]);
  if (!player) redirect("/");
  if (snapshot.game.status === "started") redirect("/game");

  return <LobbyClient player={player} initialSnapshot={snapshot} />;
}
