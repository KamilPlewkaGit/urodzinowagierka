"use client";

import { useSegmentCommand } from "@/components/segment-command";
import styles from "@/components/alkoholicy.module.css";
import { compareChipBalances, formatPolishChips } from "@/lib/chips";
import { STANDARD_DUEL_BET_DESCRIPTION, STANDARD_DUEL_BET_STAKE, TEAM_IDS, getTeam } from "@/lib/constants";
import type { AlkoholicyMarket, AlkoholicyStage, GameSnapshot, Player, TeamId, Session } from "@/lib/types";
import type { AlkoholicyAction } from "@/lib/validation";

export const alkoholicyStageLabel: Record<AlkoholicyStage, string> = {
  intro: "Wprowadzenie",
  order: "Kolejność drużyn",
  "charades-ready": "Kalambury gotowe",
  "charades-betting": "Zakłady na Kalambury",
  "charades-play": "Występy drużyn",
  "charades-review": "Sprawdzanie wyników Kalamburów",
  "charades-results": "Wyniki Kalamburów",
  "duel-setup": "Wybór drużyn do pojedynku",
  "duel-betting": "Zakłady na pojedynek",
  "duel-live": "Pojedynek trwa",
  "duel-result": "Wynik pierwszego pojedynku",
  results: "Wyniki segmentu",
  completed: "Segment zakończony",
};

const charadesRules = [
  "Każda drużyna występuje osobno, jedna po drugiej.",
  "Wybrany zawodnik pokazuje hasła swojej drużynie.",
  "Zawodnik ma trzymać wódkę w ustach.",
  "Jeśli połknie alkohol, jego występ się kończy.",
  "Drużyna ma maksymalnie 3 minuty na odgadywanie haseł.",
  "Za każde poprawnie odgadnięte hasło drużyna otrzymuje 1 punkt.",
  "Maksymalnie można zdobyć 6 punktów.",
];

export function TeamName({ id }: { id: TeamId }) {
  const team = getTeam(id);
  return <strong style={{ color: team.color }}><span aria-hidden="true">{team.icon} </span>{team.name}</strong>;
}

function BetSummary({ market }: { market: AlkoholicyMarket }) {
  const { won, lost, refunded } = market.counts;
  return <p>Trafione zakłady: <strong>{won}</strong> · Nietrafione: <strong>{lost}</strong> · Zwrócone: <strong>{refunded}</strong></p>;
}

function BalanceList({ players }: { players: Player[] }) {
  const ranking = [...players].sort((a, b) => compareChipBalances(b.tokens, a.tokens) || a.id - b.id);
  return (
    <details className={styles.balances}>
      <summary>Aktualne salda żetonów</summary>
      {ranking.length ? (
        <ul>{ranking.map((player) => <li key={player.id}><span>{player.nickname}</span><strong>{formatPolishChips(player.tokens)} żet.</strong></li>)}</ul>
      ) : <p>Brak aktywnych graczy.</p>}
    </details>
  );
}

export function AlkoholicyBoard({ snapshot, showBalances = true }: { snapshot: GameSnapshot; showBalances?: boolean }) {
  const state = snapshot.alkoholicy;
  const { stage, order, scores, performance, duelTeams, charadesLeaders, duelHistory, duelIndex } = state;
  const segmentResult = stage === "results" || stage === "completed";
  const duel = stage.startsWith("duel-");
  const charadesResult = stage === "charades-review" || stage === "charades-results" || segmentResult;
  const ranked = [...TEAM_IDS].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));

  return (
    <section className={styles.stage} aria-label="Alkoholicy">
      <header className={styles.heading}>
        <h1>ALKOHOLICY</h1>
        <p>Baw się dobrze!</p>
      </header>
      {stage === "intro" && <ul className={styles.gameList}><li>Gra 1 <strong>Kalambury</strong></li><li>Gra 2 <strong>Pojedynki</strong></li></ul>}
      {!segmentResult && stage !== "intro" && <p className={styles.kicker}>GRA {duel ? "2" : "1"} Z 2</p>}
      {segmentResult ? <h2>WYNIKI – ALKOHOLICY</h2> : charadesResult ? <h2>WYNIKI – KALAMBURY</h2> : stage !== "intro" && <h2>{duel ? "Gra 2 – Pojedynki" : "KALAMBURY"}</h2>}
      {stage === "order" && <p>Prowadzący ustala kolejność drużyn.</p>}
      {["order", "charades-ready", "charades-betting", "charades-play"].includes(stage) && (
        <ul className={styles.rules}>{charadesRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      )}
      {stage === "charades-betting" && <p>Zakłady otwarte. Typuj drużynę inną niż własna za 2 żetony.</p>}
      {stage === "charades-play" && <p className={styles.highlight}>Występ {performance + 1}/4 · <TeamName id={order[performance]} /></p>}
      {order.length > 0 && !duel && !segmentResult && !charadesResult && (
        <ol className={styles.standings} aria-label="Kolejność występów">
          {order.map((team, index) => <li key={team} aria-current={stage === "charades-play" && index === performance ? "step" : undefined}><span>{index + 1}. <TeamName id={team} /></span><span>{scores[team] === undefined ? "Oczekuje" : `${scores[team]} pkt`}</span></li>)}
        </ol>
      )}
      {charadesResult && (
        <div className={styles.result}>
          {segmentResult && <h3>Kalambury</h3>}
          <ol className={styles.standings} aria-label="Wyniki Kalamburów">
            {ranked.map((team) => <li key={team}><TeamName id={team} /><strong>{scores[team]} pkt</strong></li>)}
          </ol>
          {charadesLeaders.length === 1 ? <p>Zwycięzca Kalamburów: <TeamName id={charadesLeaders[0]} /></p> : (
            <p>Remis na pierwszym miejscu: {charadesLeaders.map((team) => getTeam(team).name).join(", ")}. {stage === "charades-review" ? "Po zatwierdzeniu stawki wrócą do graczy." : "Wszystkie stawki zostały zwrócone."}</p>
          )}
          {stage !== "charades-review" && <BetSummary market={state.charadesMarket} />}
        </div>
      )}
      {duel && (
        <div className={styles.result}>
          <h3>Pojedynek {duelIndex + 1}/2</h3>
          {duelTeams ? <p className={styles.match}><TeamName id={duelTeams[0]} /> <span>kontra</span> <TeamName id={duelTeams[1]} /></p> : <p>Prowadzący wybiera dwie drużyny.</p>}
          {stage === "duel-betting" && <p>Zakłady otwarte dla graczy z pozostałych drużyn.</p>}
          {stage === "duel-live" && <p className={styles.highlight}>POJEDYNEK TRWA</p>}
          {stage === "duel-result" && duelHistory[duelIndex] && <><p>Zwycięzca: <TeamName id={duelHistory[duelIndex].winner} /></p><BetSummary market={state.duelMarket} /></>}
        </div>
      )}
      {segmentResult && (
        <div className={styles.result}>
          <h3>Gra 2 – Pojedynki</h3>
          {duelHistory.map(({ teams, winner }, index) => <div key={index}>
            <h4>Pojedynek {index + 1}/2</h4>
            <p><TeamName id={teams[0]} /> kontra <TeamName id={teams[1]} /></p>
            <p>Zwycięzca: <TeamName id={winner} /></p>
            <BetSummary market={state.duelMarkets[index]} />
          </div>)}
          {stage === "completed" && <p>Segment zakończony.</p>}
        </div>
      )}
      {showBalances && (stage === "charades-results" || stage === "duel-result" || segmentResult) && <BalanceList players={snapshot.players} />}
    </section>
  );
}

function OwnBet({ market, label }: { market: AlkoholicyMarket; label: string }) {
  const bet = market.viewerBet;
  if (!bet) return null;
  const status = {
    pending: "Zakład zapisany",
    won: `Trafiony zakład · wypłata ${formatPolishChips(bet.payout)} żet.`,
    lost: "Nietrafiony zakład",
    refunded: `Zwrot ${formatPolishChips(bet.payout)} żet.`,
  }[bet.result];
  return <p>{label} · <TeamName id={bet.target} /> · {status}</p>;
}

export function AlkoholicyScreen({ snapshot, viewerPlayerId, refresh, viewerRole }: { snapshot: GameSnapshot; viewerPlayerId?: number; refresh: () => Promise<void>; viewerRole?: Session["role"] }) {
  const state = snapshot.alkoholicy;
  const viewer = snapshot.players.find((player) => player.id === viewerPlayerId);
  const { send, pending, error } = useSegmentCommand<AlkoholicyAction["command"]>("/api/segment/alkoholicy", state.revision, refresh);
  const market = state.stage === "charades-betting" ? 1 : state.stage === "duel-betting" ? (state.duelIndex === 0 ? 2 : 3) : null;
  const ownBet = market === 1 ? state.charadesMarket.viewerBet : state.duelMarket.viewerBet;
  const options = !viewer ? [] : market === 1 ? TEAM_IDS.filter((team) => team !== viewer.teamId)
    : market !== null && !state.duelTeams?.includes(viewer.teamId) ? state.duelTeams ?? [] : [];
  const stake = market === 1 ? state.charadesMarket.betStake : state.duelMarket.betStake;
  const canAfford = viewer && compareChipBalances(viewer.tokens, stake) >= 0;

  return (
    <div className={styles.wrapper}>
      <AlkoholicyBoard snapshot={snapshot} showBalances={viewerRole !== "observer"} />
      {viewer && (market !== null || state.charadesMarket.viewerBet || state.duelMarkets.some((duelMarket) => duelMarket.viewerBet)) && (
        <section className={styles.controls} aria-label="Twoje zakłady">
          <h2>Twoje zakłady</h2>
          <OwnBet market={state.charadesMarket} label="Kalambury" />
          {state.duelMarkets.map((duelMarket, index) => <OwnBet key={index} market={duelMarket} label={"Pojedynek nr " + (index + 1)} />)}
          {market && !ownBet && (options.length > 0 ? (
            <>
              <p>{!canAfford ? `Do postawienia zakładu potrzebujesz ${formatPolishChips(stake)} żetonów.` : stake === STANDARD_DUEL_BET_STAKE ? STANDARD_DUEL_BET_DESCRIPTION : `Stawka wynosi ${formatPolishChips(stake)} żetony.`}</p>
              <div className={styles.actions}>
                {options.map((team) => <button key={team} type="button" className="gold-button" disabled={pending || !canAfford} onClick={() => void send({ action: "bet", game: market, teamId: team })}>{getTeam(team).name}</button>)}
              </div>
            </>
          ) : <p>Zakłady na pojedynek są dostępne dla graczy spoza rywalizujących drużyn.</p>)}
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
