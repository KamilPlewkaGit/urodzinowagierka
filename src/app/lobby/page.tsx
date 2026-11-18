import { redirect } from "next/navigation";

import { LobbyClient } from "@/components/lobby-client";
import { getGameSnapshot } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "player") redirect("/");

  const snapshot = await getGameSnapshot(session.playerId);
  if (!snapshot.players.some((player) => player.id === session.playerId)) redirect("/");

  return <LobbyClient key={session.playerId} playerId={session.playerId} initialSnapshot={snapshot} />;
}
