import styles from "@/components/finale.module.css";
import { getTeam } from "@/lib/constants";
import type { FinaleSnapshot, FinaleStage, FinaleUnit, GameSnapshot, TeamScore } from "@/lib/types";

export const finaleStageLabel: Record<FinaleStage, string> = {
  intro: "Kwalifikacja do finału",
  ready: "Finaliści zatwierdzeni",
  question: "Pytanie finałowe",
  answer: "Poprawna odpowiedź",
  winner: "Zwycięzca pytania",
  wheel: "Koło fortuny",
  summary: "Koniec finału",
  completed: "Gra zakończona",
};

const rules = [
  ["Uczestnicy", "Dwie drużyny z największą liczbą punktów."],
  ["Formuła", "Szacowanie liczb i procentów."],
  ["Rozpoczyna", "Drużyna z większą liczbą punktów."],
  ["Druga drużyna", "Odpowiada „więcej” lub „mniej”."],
  ["Wygrywa pytanie", "Drużyna, której odpowiedź jest bliższa prawdy."],
  ["Nagroda", "Możliwość zakręcenia kołem fortuny."],
  ["Liczba pytań", "4."],
  ["Koło fortuny", "Fizyczne, poza aplikacją."],
];

const numberFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

export function formatFinaleEstimate(value: number, unit: FinaleUnit) {
  const amount = numberFormat.format(value);
  if (unit === "percent") return `${amount}%`;
  if (unit === "years") return `${amount} lat`;
  return amount;
}

function Finalists({ teams, question, showOpener }: {
  teams: [TeamScore, TeamScore];
  question?: NonNullable<FinaleSnapshot["question"]>;
  showOpener: boolean;
}) {
  return (
    <div className={styles.matchup} aria-label="Finaliści">
      {teams.map(({ teamId, points }, index) => {
        const team = getTeam(teamId);
        return (
          <article key={teamId} className={index === 0 && showOpener ? styles.leader : undefined}>
            <span className={styles.teamIcon} style={{ color: team.color }} aria-hidden="true">{team.icon}</span>
            <h3>{team.name}</h3>
            <p>{points} pkt{index === 0 && showOpener ? " · Rozpoczyna" : ""}</p>
            {question && (index === 0 ? (
              <p className={styles.teamEntry}>{question.estimate === null ? "Czekamy na szacunek" : formatFinaleEstimate(question.estimate, question.unit)}</p>
            ) : (
              <p className={styles.teamEntry}>{question.direction === "more" ? "WIĘCEJ" : question.direction === "less" ? "MNIEJ" : "Czekamy na wybór"}</p>
            ))}
          </article>
        );
      })}
      <span className={styles.versus} aria-hidden="true">kontra</span>
    </div>
  );
}

export function FinalePresentation({ finale }: { finale: FinaleSnapshot }) {
  const { stage, question, ranking, finalists, eligibleOrders, winners, overallWinner, roundPoints } = finale;
  const proposedOrder = eligibleOrders.length === 1 ? eligibleOrders[0] : null;
  const proposed: [TeamScore, TeamScore] | null = proposedOrder ? [ranking[0], ranking[1]] : null;
  const matchup = finalists ?? proposed;
  const preparing = stage === "intro" || stage === "ready";
  const done = stage === "summary" || stage === "completed";
  const winner = question?.winner && getTeam(question.winner);
  const screenKey = `${question?.number ?? 0}-${stage === "winner" ? "answer" : stage}`;

  return (
    <section className={styles.stage} aria-label="Finał">
      <div className={styles.presentation} key={screenKey} aria-live="polite">
        {preparing && (
          <>
            <h1 className={styles.title}>FINAŁ</h1>
            {matchup && <Finalists teams={matchup} showOpener />}
            <div className={styles.setup}>
              <section>
                <h2>Klasyfikacja ogólna</h2>
                <ol className={styles.ranking}>
                  {ranking.map((team) => {
                    const place = ranking.findIndex((entry) => entry.points === team.points) + 1;
                    return <li key={team.teamId} className={place === 1 ? styles.leader : undefined}><span>{place}. {getTeam(team.teamId).name}</span><strong>{team.points} pkt</strong></li>;
                  })}
                </ol>
                <p>{finalists ? "Finaliści zatwierdzeni." : eligibleOrders.length > 1 ? "Prowadzący rozstrzyga remis w kwalifikacji." : "Oczekiwanie na zatwierdzenie finalistów."}</p>
              </section>
              <dl className={styles.rules}>
                {rules.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
            </div>
          </>
        )}
        {stage === "question" && question && finalists && (
          <>
            <h1 className={styles.kicker}>FINAŁ</h1>
            <p className={styles.questionNumber}>PYTANIE NR {question.number}</p>
            <h2 className={styles.question}>{question.text}</h2>
            <Finalists teams={finalists} question={question} showOpener />
          </>
        )}
        {(stage === "answer" || stage === "winner") && question && (
          <>
            <p className={styles.kicker}>FINAŁ · PYTANIE NR {question.number}</p>
            <h1 className={styles.revealTitle}>POPRAWNA ODPOWIEDŹ</h1>
            <p className={styles.answer}>{question.answer}</p>
            {winner && <p className={styles.celebration}>Wygrywa {winner.name}!</p>}
          </>
        )}
        {stage === "wheel" && winner && (
          <>
            <p className={styles.kicker}>FINAŁ · PYTANIE NR {question.number}</p>
            <h1 className={styles.title}>KOŁO FORTUNY</h1>
            <p className={styles.celebration}>{winner.name}</p>
            {question?.points === null ? <p className={styles.message}>Czas zakręcić kołem fortuny!</p> : <>
              <p className={styles.message}>{winner.name} zdobywa punkty: <strong>{question?.points} pkt</strong>.</p>
              <FinaleRanking ranking={ranking} />
            </>}
          </>
        )}
        {done && finalists && (
          <>
            <h1 className={styles.title}>{overallWinner ? "ZWYCIĘZCA GRY" : "KONIEC FINAŁU"}</h1>
            {overallWinner ? <p className={styles.celebration}>{getTeam(overallWinner).name}</p> : <p className={styles.message}>Prowadzący potwierdzi końcowy wynik.</p>}
            <FinaleRanking ranking={ranking} winnerId={overallWinner} />
            <p className={styles.message}>Gratulacje dla obu drużyn! Za nami wszystkie cztery pytania.</p>
            <Finalists teams={finalists} showOpener={false} />
            <ol className={styles.history} aria-label="Zwycięzcy pytań">
              {winners.map((teamId, index) => teamId && <li key={index}>Pytanie {index + 1} <strong>{getTeam(teamId).name}{roundPoints[index] !== null ? " · " + roundPoints[index] + " pkt" : ""}</strong></li>)}
            </ol>
            {stage === "completed" && <p className={styles.message}>Gra została zakończona.</p>}
          </>
        )}
      </div>
    </section>
  );
}

function FinaleRanking({ ranking, winnerId }: { ranking: TeamScore[]; winnerId?: TeamScore["teamId"] | null }) {
  const ordered = [...ranking].sort((a, b) => b.points - a.points || Number(b.teamId === winnerId) - Number(a.teamId === winnerId));
  return <ol className={styles.ranking} aria-label="Klasyfikacja ogólna">
    {ordered.map((team) => <li key={team.teamId} className={team.teamId === winnerId || (!winnerId && team.points === ordered[0].points) ? styles.leader : undefined}>
      <span>{ordered.findIndex((entry) => entry.points === team.points) + 1}. {getTeam(team.teamId).name}</span><strong>{team.points} pkt</strong>
    </li>)}
  </ol>;
}

export function FinaleScreen({ snapshot }: { snapshot: GameSnapshot }) {
  return <FinalePresentation finale={snapshot.finale} />;
}
