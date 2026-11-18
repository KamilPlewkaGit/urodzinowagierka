import "server-only";

import type { FamiliadaAnswer, FamiliadaRepresentative, FamiliadaSnapshot, FamiliadaStage, TeamId } from "@/lib/types";
import type { FamiliadaAction } from "@/lib/validation";

const questions = [
  [
    ["Jakie jest najgorsze miejsce, w którym można zostać przyłapanym na kłamstwie?", ["W kościele", "W pracy (na rozmowie kwalifikacyjnej)", "W sądzie", "W domu", "Na policji"]],
    ["Do czego mężczyźnie najtrudniej przyznać się, że nie jest w tym dobry?", ["Seks", "Prowadzenie samochodu / orientacja w terenie", "Naprawianie rzeczy", "Sport", "Gotowanie", "Finanse", "Słuchanie innych", "Sprzątanie"]],
    ["Co mogłoby się znaleźć na ziemi pod kolejką górską po przejażdżce?", ["Pieniądze / portfel", "Telefon", "Okulary", "Czapka / kapelusz", "Klucze", "Wymiociny", "But", "Sztuczne zęby"]],
    ["Zapytaliśmy 100 żonatych mężczyzn: Jaki jest jeden dobry aspekt twojej teściowej?", ["Jest miła / pozytywna", "Dobrze gotuje", "Mieszka daleko", "Nie żyje", "Jest cicha", "Pilnuje wnuków", "Jest zabawna", "Jest bogata"]],
  ],
  [
    ["Jaki obcy akcent udają mężczyźni w barze, żeby poderwać kobietę?", ["Brytyjski", "Australijski", "Francuski", "Włoski", "Irlandzki"]],
    ["Co skąpy mężczyzna mógłby wyjąć z lodówki i użyć zamiast żelu do włosów?", ["Majonez", "Masło / margaryna", "Olej", "Galaretka", "Surowe jajko", "Bita śmietana", "Smalec / tłuszcz"]],
    ["W co człowiek może się „wsunąć” lub „wpaść”?", ["W wygodne ubrania / buty", "W śpiączkę", "Do wanny / pod prysznic", "Do łóżka"]],
    ["Więcej niż jedno zwierzę to:", ["Lama", "Owca", "Stado", "Wataha", "Ławica", "Gromada", "Rój"]],
  ],
] as const;

type Round = {
  question: string;
  answers: FamiliadaAnswer[];
  revealed: number[];
  representatives: FamiliadaRepresentative[];
  buzzerWinner: number | null;
  firstPoints: number;
  controllingTeam: TeamId | null;
  strikes?: number;
  strikesByTeam?: [number, number]; // Legacy split counters.
  stealFailed: boolean;
  pool: number;
  winner: TeamId | null;
};

type Match = {
  teams: [TeamId, TeamId];
  rounds: Round[];
  winner: TeamId | null;
  settledAt: string | null;
};

export type StoredFamiliada = {
  stage: FamiliadaStage;
  matchIndex: number;
  questionIndex: number;
  matches: [Match, Match];
};

export type FamiliadaBetSummary = {
  match_index: number;
  bet_count: number;
  target: TeamId | null;
  result: "pending" | "won" | "lost" | null;
  payout: string | null;
};

export class FamiliadaConflict extends Error {}

function createMatch(teams: [TeamId, TeamId], index: 0 | 1): Match {
  return {
    teams,
    winner: null,
    settledAt: null,
    rounds: questions[index].map(([question, answers]) => ({
      question,
      answers: answers.map((text, index) => ({ position: index + 1, text, points: answers.length - index })),
      revealed: [],
      representatives: [],
      buzzerWinner: null,
      firstPoints: 0,
      controllingTeam: null,
      strikes: 0,
      stealFailed: false,
      pool: 0,
      winner: null,
    })),
  };
}

function score(match: Match, teamId: TeamId) {
  return match.rounds.reduce((total, round) => total + (round.winner === teamId ? round.pool : 0), 0);
}

function opponent(match: Match, team: TeamId) {
  return match.teams[0] === team ? match.teams[1] : match.teams[0];
}

function getRoundStrikes(round: Round): number {
  const [first, second] = round.strikesByTeam ?? [round.strikes ?? 0, 0];
  return Math.min(3, first + second);
}

function finishRound(state: StoredFamiliada, round: Round, winner: TeamId) {
  round.winner = winner;
  state.stage = "round-result";
}

function giveControl(state: StoredFamiliada, round: Round, team: TeamId) {
  round.controllingTeam = team;
  state.stage = "play";
  if (round.revealed.length === round.answers.length) finishRound(state, round, team);
}

export function getFamiliadaSnapshot(state: StoredFamiliada | null, revision: string, bets: FamiliadaBetSummary[], isAdmin: boolean): FamiliadaSnapshot {
  const stage = state?.stage ?? "setup";
  const matchIndex = state?.matchIndex ?? 0;
  const questionIndex = state?.questionIndex ?? 0;
  const currentMatch = state?.matches[matchIndex];
  const currentRound = currentMatch?.rounds[questionIndex];
  const visible = currentRound && ["question", "buzzer", "first", "second", "no-answer", "play", "steal", "round-result"].includes(stage);
  return {
    revision,
    stage,
    matchIndex,
    questionIndex,
    matches: state?.matches.map((match, index) => {
      const bet = bets.find((row) => row.match_index === index);
      return {
        teams: match.teams,
        scores: [score(match, match.teams[0]), score(match, match.teams[1])],
        winner: match.winner,
        settledAt: match.settledAt,
        betCount: bet?.bet_count ?? 0,
        viewerBet: bet?.target && bet.result && bet.payout !== null ? { target: bet.target, result: bet.result, payout: bet.payout } : null,
      };
    }) ?? [],
    round: currentRound && (visible || (isAdmin && (stage === "question-ready" || stage === "betting-closed"))) ? {
      question: currentRound.question,
      answers: currentRound.answers.map((answer) => ({
        position: answer.position,
        revealed: currentRound.revealed.includes(answer.position) ? answer : null,
      })),
      ...(isAdmin ? { adminAnswers: currentRound.answers } : {}),
      representatives: currentRound.representatives,
      buzzerWinner: currentRound.buzzerWinner,
      controllingTeam: currentRound.controllingTeam,
      strikes: getRoundStrikes(currentRound),
      stealFailed: currentRound.stealFailed,
      pool: currentRound.pool,
      winner: currentRound.winner,
    } : null,
  };
}

type Command = FamiliadaAction["command"];

/** Applies one validated command to the fresh database document. The caller commits it conditionally. */
export function advanceFamiliada(state: StoredFamiliada | null, command: Command, players: FamiliadaRepresentative[], voterId?: number): StoredFamiliada {
  const { action } = command;
  if (action === "configure" && (!state || state.stage === "setup")) {
    const [a, b, c, d] = command.teams;
    return { stage: "setup", matchIndex: 0, questionIndex: 0, matches: [createMatch([a, b], 0), createMatch([c, d], 1)] };
  }
  if (!state) throw new FamiliadaConflict("Najpierw zatwierdź drużyny obu meczów.");
  const stage = state.stage;
  const match = state.matches[state.matchIndex];
  const round = match.rounds[state.questionIndex];
  const beforeFirstAnswer = stage === "question" || stage === "buzzer" || stage === "first";

  switch (action) {
    case "start":
      if (stage === "setup") { state.stage = "match-ready"; return state; }
      break;
    case "open-betting":
      if (stage === "match-ready") { state.stage = "betting"; return state; }
      break;
    case "close-betting":
      if (stage === "match-ready" || stage === "betting") { state.stage = "betting-closed"; return state; }
      break;
    case "start-question":
    case "replace-representatives":
      if ((action === "start-question" && ["betting-closed", "question-ready"].includes(stage)) ||
          (action === "replace-representatives" && stage === "question")) {
        if (players.length !== 2 || !match.teams.every((team, index) => players[index].teamId === team)) {
          throw new FamiliadaConflict("Wybierz po jednym aktywnym przedstawicielu każdej drużyny.");
        }
        round.representatives = players;
        state.stage = "question";
        return state;
      }
      break;
    case "activate":
      if (stage === "question") {
        if (players.length !== 2) throw new FamiliadaConflict("Wybierz ponownie aktywnych przedstawicieli obu drużyn.");
        state.stage = "buzzer";
        return state;
      }
      break;
    case "reset-buzzer":
      if (beforeFirstAnswer || stage === "no-answer") {
        round.buzzerWinner = null;
        round.firstPoints = 0;
        state.stage = "question";
        return state;
      }
      break;
    case "buzz":
    case "respondent": {
      const respondentId = "playerId" in command ? command.playerId : voterId;
      if ((action === "buzz" ? stage === "buzzer" : beforeFirstAnswer) &&
          respondentId !== undefined &&
          players.some((player) => player.id === respondentId) &&
          round.representatives.some((player) => player.id === respondentId)) {
        round.buzzerWinner = respondentId;
        state.stage = "first";
        return state;
      }
      throw new FamiliadaConflict("Przycisk jest zamknięty albo gracz nie jest aktywnym przedstawicielem.");
    }
    case "answer":
    case "mistake": {
      if (!["first", "second", "play", "steal", "round-result"].includes(stage)) break;
      const answer = action === "answer" ? round.answers[command.position - 1] : null;
      if (action === "answer" && (!answer || round.revealed.includes(answer.position))) {
        throw new FamiliadaConflict("Wybierz odpowiedź, która wciąż jest ukryta.");
      }
      if (stage === "round-result") {
        if (!answer) break;
        round.revealed.push(answer.position);
        return state;
      }
      if (answer) {
        round.revealed.push(answer.position);
        round.pool += answer.points;
      }
      if (stage === "first" || stage === "second") {
        const first = round.representatives.find((player) => player.id === round.buzzerWinner)!;
        if (stage === "first") {
          round.firstPoints = answer?.points ?? 0;
          if (answer?.position === 1) giveControl(state, round, first.teamId);
          else state.stage = "second";
        } else if (round.firstPoints || answer) {
          giveControl(state, round, (answer?.points ?? 0) > round.firstPoints ? opponent(match, first.teamId) : first.teamId);
        } else {
          state.stage = "no-answer";
        }
      } else {
        const controllingTeam = round.controllingTeam!;
        const answeringTeam = stage === "play" ? controllingTeam : opponent(match, controllingTeam);
        if (answer) {
          if (stage === "steal" || round.revealed.length === round.answers.length) {
            finishRound(state, round, answeringTeam);
          }
        } else if (stage === "steal") {
          round.stealFailed = true;
          finishRound(state, round, controllingTeam);
        } else {
          round.strikes = Math.min(3, getRoundStrikes(round) + 1);
          delete round.strikesByTeam;
          if (round.strikes === 3) state.stage = "steal";
        }
      }
      return state;
    }
    case "control":
      if (stage === "no-answer" && match.teams.includes(command.teamId)) {
        giveControl(state, round, command.teamId);
        return state;
      }
      break;
    case "next":
      if (stage === "round-result") {
        if (state.questionIndex + 1 === match.rounds.length) state.stage = "match-confirmation";
        else {
          state.questionIndex++;
          state.stage = "question-ready";
        }
        return state;
      }
      if (stage === "match-result" && state.matchIndex === 0) {
        state.matchIndex = 1;
        state.questionIndex = 0;
        state.stage = "match-ready";
        return state;
      }
      break;
    case "confirm-match":
      if (stage === "match-confirmation" && !match.settledAt && match.teams.includes(command.teamId)) {
        if (score(match, command.teamId) < score(match, opponent(match, command.teamId))) {
          throw new FamiliadaConflict("Zatwierdź drużynę z najwyższym wynikiem.");
        }
        match.winner = command.teamId;
        match.settledAt = new Date().toISOString();
        state.stage = "match-result";
        return state;
      }
      break;
    case "complete":
      if (stage === "match-result" && state.matchIndex === 1) { state.stage = "completed"; return state; }
      break;
  }
  throw new FamiliadaConflict("Ta akcja jest niedostępna w obecnej fazie Familiady.");
}
