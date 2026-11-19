"use client";

import { getTeam } from "@/lib/constants";
import type { GameSnapshot, TeamId } from "@/lib/types";

type Correction = {
  label: string;
  revision: string;
  current: string;
  options: { value: string; label: string }[];
  endpoint: string;
  body: (value: string) => object;
};

const teamOptions = (teams: TeamId[]) => teams.map((team) => ({ value: team, label: getTeam(team).name }));

function getCorrections(snapshot: GameSnapshot): Correction[] {
  const segment = snapshot.game.activeSegment;
  if (segment === "sport" || segment === "pojedynki") {
    const events = segment === "sport"
      ? snapshot.sport.challenges.map((challenge) => {
          const pair = snapshot.sport.pairings.find(({ slot }) => slot === challenge.pairSlot);
          return { ...challenge, teams: pair ? [pair.teamAId, pair.teamBId] : [], label: "Wyzwanie nr " + (challenge.sequence + 1) };
        })
      : snapshot.pojedynki.duels.map((duel) => ({
          ...duel, teams: duel.teamAId && duel.teamBId ? [duel.teamAId, duel.teamBId] : [],
          label: "Pojedynek nr " + (duel.sequence + 1),
        }));
    return events.flatMap(({ id, scoreRevision, winnerTeamId, teams, label }) => {
      if (!scoreRevision || !winnerTeamId || !teams.length) return [];
      return [{
        label, revision: scoreRevision, current: winnerTeamId, options: teamOptions(teams),
        endpoint: "/api/segment/" + segment + "/finish",
        body: (value: string) => ({ eventId: id, correctionRevision: scoreRevision, winnerTeamId: value }),
      }];
    });
  }
  if (segment === "familiada") {
    const { revision, matches } = snapshot.familiada;
    return matches.flatMap((match, matchIndex) => {
      if (!match.settledAt || !match.winner || match.scores[0] !== match.scores[1]) return [];
      return [{
        label: "Rozstrzygnięcie remisu w meczu nr " + (matchIndex + 1),
        revision, current: match.winner, options: teamOptions(match.teams), endpoint: "/api/segment/familiada",
        body: (value: string) => ({ revision, command: { action: "correct-match", matchIndex, teamId: value } }),
      }];
    });
  }
  if (segment === "gold-challenge") {
    const { revision, representatives, reward, winner, firstScoreTeam, sixResult } = snapshot.goldChallenge;
    const endpoint = "/api/segment/gold-challenge";
    const corrections: Correction[] = [];
    const scoredRepresentative = firstScoreTeam ? representatives.find((rep) => rep.teamId === firstScoreTeam) : winner;
    if (reward && scoredRepresentative) {
      corrections.push({
        label: "Najdzielniejszy zawodnik", revision, current: String(scoredRepresentative.id), endpoint,
        options: representatives.map((rep) => ({ value: String(rep.id), label: rep.nickname + " · " + getTeam(rep.teamId).name })),
        body: (value) => ({ revision, command: { action: "correct-winner", playerId: Number(value) } }),
      });
    }
    if (sixResult && snapshot.goldChallenge.adminNumbers) {
      corrections.push({
        label: "Szczęśliwa szóstka · poprawny numer", revision, current: String(sixResult.scoreNumber ?? sixResult.number), endpoint,
        options: ["1", "2", "3", "4", "5", "6"].map((value) => ({ value, label: value })),
        body: (value) => ({ revision, command: { action: "correct-number", number: Number(value) } }),
      });
    }
    return corrections;
  }
  return [];
}

export function TeamScoreCorrections({ snapshot, disabled, save }: {
  snapshot: GameSnapshot;
  disabled: boolean;
  save: (endpoint: string, body: object) => Promise<boolean>;
}) {
  const corrections = getCorrections(snapshot);
  if (!corrections.length) return null;
  return (
    <details className="management-panel">
      <summary>Korekta punktacji drużyn</summary>
      <p>Korekta zmienia klasyfikację ogólną. Wypłacone żetony pozostają w saldach.</p>
      {corrections.map(({ label, revision, current, options, endpoint, body }) => (
        <form key={label + revision} onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("result");
          if (typeof value === "string" && value !== current) void save(endpoint, body(value));
        }}>
          <label className="field-label">{label}
            <select className="text-input" name="result" defaultValue={current} disabled={disabled}>
              {options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className="secondary-button" type="submit" disabled={disabled}>Zapisz korektę</button>
        </form>
      ))}
    </details>
  );
}
