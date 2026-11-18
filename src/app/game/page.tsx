import { redirect } from "next/navigation";

import { GameScreen } from "@/components/game-screen";
import { FloorScreen } from "@/components/floor-screen";
import { MelodiaScreen } from "@/components/melodia-screen";
import { PojedynkiScreen } from "@/components/pojedynki-screen";
import { SportScreen } from "@/components/sport-screen";
import { getGameSnapshot, getPlayer } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GamePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  if (session.role === "player" && !(await getPlayer(session.playerId))) redirect("/");

  const snapshot = await getGameSnapshot(session.role === "player" ? session.playerId : undefined);
  if (snapshot.game.status === "waiting") redirect(session.role === "admin" ? "/admin" : "/lobby");

  if (snapshot.game.activeSegment === "the-floor") {
    return <FloorScreen initialSnapshot={snapshot} viewerRole={session.role} viewerPlayerId={session.role === "player" ? session.playerId : undefined} />;
  }

  if (snapshot.game.activeSegment === "sport") {
    return <SportScreen initialSnapshot={snapshot} viewerRole={session.role} viewerPlayerId={session.role === "player" ? session.playerId : undefined} />;
  }

  if (snapshot.game.activeSegment === "melodia") {
    return <MelodiaScreen initialSnapshot={snapshot} viewerRole={session.role} viewerPlayerId={session.role === "player" ? session.playerId : undefined} />;
  }

  if (snapshot.game.activeSegment === "pojedynki") {
    return <PojedynkiScreen initialSnapshot={snapshot} viewerRole={session.role} viewerPlayerId={session.role === "player" ? session.playerId : undefined} />;
  }

  return <GameScreen initialSnapshot={snapshot} viewerRole={session.role} />;
}
