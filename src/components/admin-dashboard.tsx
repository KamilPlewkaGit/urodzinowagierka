"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { CasinoLogo } from "@/components/casino-logo";
import { FloorAdminControls } from "@/components/floor-admin-controls";
import { MelodiaAdminControls } from "@/components/melodia-admin-controls";
import { PojedynkiAdminControls } from "@/components/pojedynki-admin-controls";
import { FamiliadaAdminControls } from "@/components/familiada-admin-controls";
import { familiadaPhaseLabel } from "@/components/familiada-screen";
import { FinaleAdminControls } from "@/components/finale-admin-controls";
import { finaleStageLabel } from "@/components/finale-screen";
import { AlkoholicyAdminControls } from "@/components/alkoholicy-admin-controls";
import { alkoholicyStageLabel } from "@/components/alkoholicy-screen";
import { GoldChallengeAdminControls } from "@/components/gold-challenge-admin-controls";
import { GOLD_TITLE, goldStageLabel } from "@/components/gold-challenge-screen";
import { SportAdminControls } from "@/components/sport-admin-controls";
import { TeamScoreCorrections } from "@/components/team-score-corrections";
import { POLL_INTERVAL_MS, TEAMS, getSegmentNumber, getTeam } from "@/lib/constants";
import { THE_FLOOR_POLL_INTERVAL_MS } from "@/lib/floor";
import { formatChips } from "@/lib/chips";
import { getSolenizantQuestion, SOLENIZANT_LAST_QUESTION_INDEX, SOLENIZANT_QUESTION_COUNT, SOLENIZANT_TITLE } from "@/lib/solenizant";
import type { GameSnapshot, TeamId } from "@/lib/types";
import type { AlkoholicyAction, FinaleCommand, GoldAction } from "@/lib/validation";

type ApiError = { error?: string };

const AVAILABLE_SEGMENTS = [{ id: "solenizant", name: "Solenizant" }, { id: "the-floor", name: "The Floor" }, { id: "sport", name: "Sport" }, { id: "melodia", name: "Jaka to melodia?" }, { id: "pojedynki", name: "Pojedynki" }, { id: "familiada", name: "Familiada" }, { id: "gold-challenge", name: GOLD_TITLE }, { id: "alkoholicy", name: "ALKOHOLICY" }, { id: "finale", name: "FINAŁ" }] as const;

interface AdminDashboardProps {
  initialSnapshot: GameSnapshot;
}

export function AdminDashboard({ initialSnapshot }: AdminDashboardProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<TeamId[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState("solenizant");
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  const [chipValue, setChipValue] = useState("");
  const [error, setError] = useState("");
  const [removalNotice, setRemovalNotice] = useState("");
  const refreshSequence = useRef(0);
  const appliedSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const response = await fetch("/api/game/state", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error("Nie udało się pobrać stanu gry.");
      const next = (await response.json()) as GameSnapshot;
      if (sequence > appliedSequence.current) {
        appliedSequence.current = sequence;
        setSnapshot(next);
      }
    } catch {
      // Zachowaj ostatni poprawny stan; kolejne odpytywanie podejmie próbę ponownie.
    }
  }, [router]);

  const intervalMs = snapshot.game.activeSegment === "the-floor" ? THE_FLOOR_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
  useEffect(() => {
    let reading = false;
    const interval = window.setInterval(async () => {
      if (reading) return;
      reading = true;
      try { await refresh(); } finally { reading = false; }
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [refresh, intervalMs]);

  async function postAction(action: string, endpoint: string, body?: object) {
    setError("");
    setPendingAction(action);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) {
        setError(payload?.error ?? "Nie udało się wykonać tej operacji.");
        if ((action === "finale" || action === "alkoholicy" || action === "gold-challenge" || action === "correct-score") && response.status === 409) await refresh();
        return false;
      }
      await refresh();
      return true;
    } catch {
      setError("Nie udało się połączyć z usługą gry.");
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function startGame() {
    await postAction("game", "/api/game/start");
  }

  async function startSegment() {
    await postAction("segment", "/api/segment/solenizant/start");
  }

  async function openScoring() {
    setSelectedTeamIds([]);
    await postAction("scoring", "/api/segment/solenizant/scoring", {
      questionIndex: snapshot.game.currentQuestionIndex,
    });
  }

  function toggleTeam(teamId: TeamId) {
    setSelectedTeamIds((current) => current.includes(teamId)
      ? current.filter((id) => id !== teamId)
      : [...current, teamId]);
  }

  async function confirmScore() {
    const completed = await postAction("score", "/api/segment/solenizant/score", {
      questionIndex: snapshot.game.currentQuestionIndex,
      teamIds: selectedTeamIds,
    });
    if (completed) setSelectedTeamIds([]);
  }

  async function navigateToSegment() {
    await postAction("navigation", "/api/admin/game/segment", { segmentId: selectedSegmentId });
  }

  async function navigateRelative(direction: -1 | 1) {
    const currentIndex = AVAILABLE_SEGMENTS.findIndex((segment) => segment.id === snapshot.game.activeSegment);
    const target = AVAILABLE_SEGMENTS[currentIndex + direction];
    if (!target) return;
    setSelectedSegmentId(target.id);
    await postAction("navigation", "/api/admin/game/segment", { segmentId: target.id });
  }

  async function restartSegment() {
    if (snapshot.game.activeSegment === "gold-challenge") {
      if (window.confirm("Uruchomić złote wyzwanie od początku? Nominacje i wybór drużyn zostaną usunięte.")) await sendGold({ action: "restart" });
      return;
    }
    if (snapshot.game.activeSegment === "alkoholicy") {
      if (window.confirm("Uruchomić segment ALKOHOLICY od początku? Punkty z tego segmentu zostaną odjęte, a oczekujące stawki zwrócone. Zaksięgowane wypłaty pozostaną w saldach.")) await sendAlkoholicy({ action: "restart" });
      return;
    }
    if (snapshot.game.activeSegment === "finale") {
      const rewardMessage = snapshot.finale.chipReward ? " Transfery nagrody finałowej zostaną cofnięte." : "";
      if (window.confirm("Uruchomić finał od początku? Zapisani finaliści i wyniki pytań zostaną usunięci, a punkty z finału odjęte." + rewardMessage)) {
        await sendFinale({ action: "restart" });
      }
      return;
    }
    if (snapshot.game.activeSegment === "familiada") {
      if (window.confirm("Uruchomić Familiadę od początku? Wyniki i punkty obu meczów zostaną usunięte, a oczekujące stawki zwrócone.")) {
        await postAction("restart", "/api/segment/familiada", { revision: snapshot.familiada.revision, command: { action: "restart" } });
      }
      return;
    }
    const segmentName = AVAILABLE_SEGMENTS.find((segment) => segment.id === snapshot.game.activeSegment)?.name ?? "wybrany";
    const restartMessage = snapshot.game.activeSegment === "the-floor"
      ? "Uruchomić The Floor od początku? Wyniki i punkty tego segmentu zostaną usunięte, a oczekujące stawki zwrócone."
      : snapshot.game.activeSegment === "sport" || snapshot.game.activeSegment === "pojedynki"
        ? `Uruchomić segment ${segmentName} od początku? Punkty za zwycięstwa zostaną usunięte, a oczekujące stawki zwrócone.`
        : `Czy na pewno uruchomić segment ${segmentName} od początku? Zostanie skasowany tylko jego postęp. Żetony graczy pozostaną bez zmian.`;
    if (!window.confirm(restartMessage)) {
      return;
    }
    const endpoint = snapshot.game.activeSegment === "the-floor"
      ? "/api/segment/floor/restart"
      : snapshot.game.activeSegment === "sport"
        ? "/api/segment/sport/restart"
        : snapshot.game.activeSegment === "melodia"
          ? "/api/segment/melodia/restart"
          : snapshot.game.activeSegment === "pojedynki"
            ? "/api/segment/pojedynki/restart"
            : "/api/segment/solenizant/restart";
    await postAction("restart", endpoint);
  }

  async function sendFinale(command: FinaleCommand) {
    await postAction("finale", "/api/segment/finale", { revision: snapshot.finale.revision, command });
  }

  async function sendAlkoholicy(command: AlkoholicyAction["command"]) {
    await postAction("alkoholicy", "/api/segment/alkoholicy", { revision: snapshot.alkoholicy.revision, command });
  }

  async function sendGold(command: GoldAction["command"]) {
    await postAction("gold-challenge", "/api/segment/gold-challenge", { revision: snapshot.goldChallenge.revision, command });
  }

  async function resetEntireGame() {
    if (!window.confirm("Czy na pewno zresetować całą grę? Postęp i wyniki segmentów zostaną usunięte, a żetony aktywnych graczy wrócą do 100. Gracze i ich drużyny pozostaną zapisani.")) {
      return;
    }
    await postAction("reset", "/api/admin/game/reset");
  }

  function beginChipEdit(playerId: number, tokens: string) {
    setEditingPlayerId(playerId);
    setChipValue(formatChips(tokens));
  }

  async function saveChipBalance(playerId: number) {
    const saved = await postAction("chips", "/api/admin/players/chips", { playerId, tokens: chipValue });
    if (saved) {
      setEditingPlayerId(null);
      setChipValue("");
    }
  }

  async function removePlayer(playerId: number, nickname: string) {
    if (!window.confirm(`Czy na pewno usunąć gracza „${nickname}”? Nie będzie mógł wrócić przy użyciu tego samego pseudonimu.`)) {
      return;
    }
    setRemovalNotice("");
    const removed = await postAction("remove", "/api/admin/players/remove", { playerId });
    if (removed) {
      setRemovalNotice(`Gracz „${nickname}” został usunięty z aktywnej listy.`);
      if (editingPlayerId === playerId) {
        setEditingPlayerId(null);
        setChipValue("");
      }
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const { status, solenizantStage, currentQuestionIndex, activeSegment } = snapshot.game;
  const isStarted = status === "started";
  const question = getSolenizantQuestion(currentQuestionIndex);
  const pointsFor = (teamId: TeamId) => snapshot.teamScores.find((score) => score.teamId === teamId)?.points ?? 0;
  const solenizantStatusLabel = !isStarted
    ? "Lobby oczekuje"
    : solenizantStage === "intro"
      ? "Segment gotowy"
      : solenizantStage === "scoring"
        ? `Punktacja ${currentQuestionIndex + 1}/${SOLENIZANT_QUESTION_COUNT}`
        : solenizantStage === "results"
          ? "Segment zakończony"
          : `Pytanie ${currentQuestionIndex + 1}/${SOLENIZANT_QUESTION_COUNT}`;
  const floorStatusLabel = !isStarted
    ? "Lobby oczekuje"
    : snapshot.theFloor.stage === "intro" ? "Segment gotowy"
      : snapshot.theFloor.stage === "setup" ? `Wybór pary ${snapshot.game.currentTheFloorDuelSequence + 1}/${snapshot.theFloor.duels.length}`
        : snapshot.theFloor.stage === "betting" ? "Zakłady otwarte"
          : snapshot.theFloor.stage === "live" ? "Pojedynek trwa"
            : snapshot.theFloor.stage === "result" ? "Wynik pojedynku"
              : "Segment zakończony";
  const sportStatusLabel = !isStarted
    ? "Lobby oczekuje"
    : snapshot.sport.stage === "intro" ? "Segment gotowy"
      : snapshot.sport.stage === "setup" ? "Pary i numery"
        : snapshot.sport.stage === "betting" ? `Zakłady: wyzwanie ${snapshot.game.currentSportChallengeSequence + 1}/8`
          : snapshot.sport.stage === "live" ? "Wyzwanie trwa"
            : snapshot.sport.stage === "result" ? "Wynik wyzwania"
              : snapshot.sport.stage === "bonus-setup" ? "Przygotowanie bonusu"
                : snapshot.sport.stage === "bonus-live" ? "Bonus trwa"
                  : snapshot.sport.stage === "bonus-result" ? "Wynik bonusu"
                    : "Segment zakończony";
  const melodiaStatusLabel = !isStarted
    ? "Lobby oczekuje"
    : snapshot.melodia.stage === "intro" ? "Segment gotowy"
      : snapshot.melodia.stage === "ready" ? "Drużyny zatwierdzone"
        : snapshot.melodia.stage === "song" ? `Piosenka ${snapshot.game.currentMelodiaSongSequence + 1}/5`
          : snapshot.melodia.stage === "scoring" ? "Punktacja piosenki"
            : snapshot.melodia.stage === "result" ? "Wynik piosenki"
              : snapshot.melodia.stage === "completed" ? "Segment zakończony"
                : "Wyniki segmentu";
  const pojedynkiStatusLabel = !isStarted
    ? "Lobby oczekuje"
    : snapshot.pojedynki.stage === "intro" ? "Segment gotowy"
      : snapshot.pojedynki.stage === "setup" ? `Wybór drużyn: pojedynek ${snapshot.game.currentPojedynkiDuelSequence + 1}/4`
        : snapshot.pojedynki.stage === "betting" ? "Zakłady otwarte"
          : snapshot.pojedynki.stage === "live" ? "Pojedynek trwa"
            : snapshot.pojedynki.stage === "result" ? "Wynik pojedynku"
              : "Segment zakończony";
  const finaleActive = activeSegment === "finale" && isStarted;
  const alkoholicyActive = activeSegment === "alkoholicy" && isStarted;
  const goldActive = activeSegment === "gold-challenge" && isStarted;
  const statusLabel = finaleActive ? finaleStageLabel[snapshot.finale.stage] : alkoholicyActive ? alkoholicyStageLabel[snapshot.alkoholicy.stage] : goldActive ? goldStageLabel[snapshot.goldChallenge.stage] : activeSegment === "the-floor" ? floorStatusLabel : activeSegment === "sport" ? sportStatusLabel : activeSegment === "melodia" ? melodiaStatusLabel : activeSegment === "pojedynki" ? pojedynkiStatusLabel : activeSegment === "familiada" && isStarted ? familiadaPhaseLabel[snapshot.familiada.stage] : solenizantStatusLabel;
  const restartUnavailable = (activeSegment === "finale" && snapshot.finale.stage === "intro")
    || (activeSegment === "alkoholicy" && snapshot.alkoholicy.stage === "intro")
    || (activeSegment === "gold-challenge" && (snapshot.goldChallenge.stage === "intro" || Boolean(snapshot.goldChallenge.reward)));
  const activeSegmentIndex = AVAILABLE_SEGMENTS.findIndex((segment) => segment.id === activeSegment);

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <CasinoLogo />
        <div className="topbar-actions">
          <span className="admin-badge">Prowadzący</span>
          <button className="quiet-button" onClick={logout}>Wyloguj się</button>
        </div>
      </header>

      <section className="admin-intro">
        <div>
          <span className="eyebrow">Panel prowadzącego</span>
          <h1>Steruj <em>stołem.</em></h1>
          <p>Rozpocznij grę, uruchom segment i samodzielnie rozliczaj odpowiedzi drużyn.</p>
        </div>
        <div className={`game-status ${isStarted ? "is-live" : ""}`}>
          <span className="status-light" />
          <span>{statusLabel}</span>
        </div>
      </section>

      <section className="admin-control-grid">
        <article className="start-panel segment-admin-panel">
          {!isStarted ? (
            <>
              <span className="panel-index">01 / START GRY</span>
              <h2>Gotowi do gry?</h2>
              <p>Po rozpoczęciu gra pojawi się w zakładce „Aktualny segment” w panelu gracza.</p>
              <button className="gold-button start-button" onClick={startGame} disabled={pendingAction !== null}>
                <span>{pendingAction === "game" ? "Rozpoczynanie gry…" : "Rozpocznij grę"}</span>
                <span aria-hidden="true">→</span>
              </button>
            </>
          ) : null}

          {isStarted && activeSegment === "the-floor" ? (
            <>
              <span className="panel-index">01 / AKTYWNY SEGMENT</span>
              <h2>The Floor</h2>
              <p>Pełne sterowanie parami, zakładami i zegarami znajduje się poniżej.</p>
            </>
          ) : null}

          {isStarted && activeSegment === "sport" ? (
            <>
              <span className="panel-index">01 / AKTYWNY SEGMENT</span>
              <h2>Sport</h2>
              <p>Pełne sterowanie parami, numerami, zakładami i wyzwaniami bonusowymi znajduje się poniżej.</p>
            </>
          ) : null}

          {isStarted && activeSegment === "melodia" ? (
            <>
              <span className="panel-index">01 / AKTYWNY SEGMENT</span>
              <h2>Jaka to melodia?</h2>
              <p>Wybierz drużyny, przeprowadź pięć rund i zatwierdź rozliczenie żetonów.</p>
            </>
          ) : null}

          {isStarted && activeSegment === "pojedynki" ? (
            <>
              <span className="panel-index">01 / AKTYWNY SEGMENT</span>
              <h2>Pojedynki</h2>
              <p>Pełne sterowanie czterema pojedynkami, zakładami i wynikami znajduje się poniżej.</p>
            </>
          ) : null}

          {isStarted && activeSegment === "familiada" && (
            <>
              <span className="panel-index">SEGMENT VIII</span>
              <h2>Familiada</h2>
              <p>Dwa mecze po cztery pytania.</p>
            </>
          )}

          {finaleActive && (
            <>
              <span className="panel-index">OSTATNI SEGMENT</span>
              <h2>FINAŁ</h2>
              <p>Dwie drużyny i cztery pytania finałowe.</p>
            </>
          )}

          {(alkoholicyActive || goldActive) && <h2>{goldActive ? GOLD_TITLE : "ALKOHOLICY"}</h2>}

          {isStarted && activeSegment === "solenizant" && solenizantStage === "intro" ? (
            <>
              <span className="panel-index">01 / PIERWSZY SEGMENT</span>
              <h2>{SOLENIZANT_TITLE}</h2>
              <p>Grają wszyscy. Zakłady są wyłączone, a każda poprawna odpowiedź daje drużynie jeden punkt.</p>
              <div className="segment-rules admin-segment-rules">
                <span><strong>Grają:</strong> wszyscy</span>
                <span><strong>Zakłady:</strong> wyłączone</span>
                <span><strong>Punktacja:</strong> 1 punkt za poprawną odpowiedź</span>
              </div>
              <button className="gold-button start-button" onClick={startSegment} disabled={pendingAction !== null}>
                <span>{pendingAction === "segment" ? "Uruchamianie segmentu…" : "Rozpocznij segment"}</span>
                <span aria-hidden="true">→</span>
              </button>
            </>
          ) : null}

          {isStarted && activeSegment === "solenizant" && solenizantStage === "question" && question ? (
            <>
              <span className="panel-index">{SOLENIZANT_TITLE} / PYTANIE {currentQuestionIndex + 1}/{SOLENIZANT_QUESTION_COUNT}</span>
              <h2 className="admin-segment-question">{question}</h2>
              <p>Gracze widzą to pytanie, dopóki nie zatwierdzisz punktów.</p>
              <button className="gold-button start-button" onClick={openScoring} disabled={pendingAction !== null}>
                <span>{pendingAction === "scoring" ? "Przechodzenie dalej…" : "Przejdź dalej"}</span>
                <span aria-hidden="true">→</span>
              </button>
            </>
          ) : null}

          {isStarted && activeSegment === "solenizant" && solenizantStage === "scoring" && question ? (
            <>
              <span className="panel-index">{SOLENIZANT_TITLE} / PUNKTACJA {currentQuestionIndex + 1}/{SOLENIZANT_QUESTION_COUNT}</span>
              <h2 className="admin-segment-question">{question}</h2>
              <p>Wybierz wszystkie drużyny, które odpowiedziały poprawnie. Możesz nie wybrać żadnej.</p>
              <div className="score-choice-grid" aria-label="Wybór poprawnych drużyn">
                {TEAMS.map((team) => {
                  const selected = selectedTeamIds.includes(team.id);
                  return (
                    <button
                      className={`score-choice ${selected ? "is-selected" : ""}`}
                      key={team.id}
                      type="button"
                      onClick={() => toggleTeam(team.id)}
                      disabled={pendingAction !== null}
                      aria-pressed={selected}
                      style={{ "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties}
                    >
                      <span>{team.icon}</span>
                      <strong>{team.name}</strong>
                      <small>{selected ? "Poprawna odpowiedź" : "Brak punktu"}</small>
                    </button>
                  );
                })}
              </div>
              <button className="gold-button start-button" onClick={confirmScore} disabled={pendingAction !== null}>
                <span>{pendingAction === "score"
                  ? "Zapisywanie punktów…"
                  : currentQuestionIndex === SOLENIZANT_LAST_QUESTION_INDEX
                    ? "Zatwierdź punkty i pokaż wyniki"
                    : "Zatwierdź punkty i przejdź dalej"}</span>
                <span aria-hidden="true">✓</span>
              </button>
            </>
          ) : null}

          {isStarted && activeSegment === "solenizant" && solenizantStage === "results" ? (
            <>
              <span className="panel-index">{SOLENIZANT_TITLE} / WYNIKI</span>
              <h2>Segment zakończony.</h2>
              <p>Wszystkie sześć pytań zostało rozliczonych. Wyniki drużyn są widoczne poniżej.</p>
            </>
          ) : null}

          {error && !finaleActive && !alkoholicyActive && !goldActive ? <p className="form-error" role="alert">{error}</p> : null}
          {removalNotice ? <p className="form-success" role="status">{removalNotice}</p> : null}
        </article>

        <article className="admin-stat-panel">
          <span className="panel-index">02 / STÓŁ</span>
          <div className="admin-stat"><strong>{snapshot.players.length}</strong><span>zarejestrowani gracze</span></div>
          <div className="admin-stat"><strong>{formatChips(snapshot.totalTokens)}</strong><span>żetony w grze</span></div>
        </article>
      </section>

      {isStarted && activeSegment === "the-floor" ? <FloorAdminControls snapshot={snapshot} onRefresh={refresh} /> : null}
      {isStarted && activeSegment === "sport" ? <SportAdminControls snapshot={snapshot} onRefresh={refresh} /> : null}
      {isStarted && activeSegment === "melodia" ? <MelodiaAdminControls snapshot={snapshot} onRefresh={refresh} /> : null}
      {isStarted && activeSegment === "pojedynki" ? <PojedynkiAdminControls snapshot={snapshot} onRefresh={refresh} /> : null}
      {isStarted && activeSegment === "familiada" ? <FamiliadaAdminControls snapshot={snapshot} onRefresh={refresh} /> : null}
      {finaleActive && <FinaleAdminControls finale={snapshot.finale} disabled={pendingAction !== null} send={sendFinale} error={error} />}
      {alkoholicyActive && <AlkoholicyAdminControls snapshot={snapshot} disabled={pendingAction !== null} send={sendAlkoholicy} error={error} />}
      {goldActive && <GoldChallengeAdminControls snapshot={snapshot} disabled={pendingAction !== null} send={sendGold} error={error} />}
      {isStarted && <TeamScoreCorrections snapshot={snapshot} disabled={pendingAction !== null}
        save={(endpoint, body) => postAction("correct-score", endpoint, body)} />}

      <section className="admin-management-grid" aria-label="Zarządzanie grą">
        <article className="management-panel">
          <span className="panel-index">03 / ZARZĄDZANIE GRĄ</span>
          <h2>Nawigacja segmentów</h2>
          <p>Aktywny segment: <strong>{AVAILABLE_SEGMENTS.find((segment) => segment.id === activeSegment)?.name}</strong>.</p>
          <div className="management-actions">
            <button className="secondary-button" type="button" onClick={() => navigateRelative(-1)} disabled={pendingAction !== null || activeSegmentIndex <= 0} title="Przejdź do wcześniejszego segmentu">Poprzedni segment</button>
            <button className="secondary-button" type="button" onClick={() => navigateRelative(1)} disabled={pendingAction !== null || activeSegmentIndex >= AVAILABLE_SEGMENTS.length - 1} title="Przejdź do następnego segmentu">Następny segment</button>
          </div>
          <label className="field-label" htmlFor="segment-select">Dostępne segmenty</label>
          <div className="segment-navigation-row">
            <select
              id="segment-select"
              className="text-input"
              value={selectedSegmentId}
              onChange={(event) => setSelectedSegmentId(event.target.value)}
              disabled={pendingAction !== null}
            >
              {AVAILABLE_SEGMENTS.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
            </select>
            <button className="secondary-button" type="button" onClick={navigateToSegment} disabled={pendingAction !== null}>Przejdź do segmentu</button>
          </div>
          <div className="management-actions">
            <button className="secondary-button" type="button" onClick={restartSegment} disabled={pendingAction !== null || restartUnavailable}>Uruchom segment od początku</button>
            <button className="danger-button" type="button" onClick={resetEntireGame} disabled={pendingAction !== null}>Zresetuj grę</button>
          </div>
        </article>

        <article className="management-panel monitoring-panel">
          <span className="panel-index">04 / MONITORING</span>
          <h2>Stan stołu</h2>
          <dl className="monitoring-list">
            <div><dt>Aktywny segment</dt><dd>{getSegmentNumber(activeSegment)} · {AVAILABLE_SEGMENTS.find((segment) => segment.id === activeSegment)?.name}</dd></div>
            <div><dt>Faza segmentu</dt><dd>{statusLabel}</dd></div>
            <div><dt>Aktywni gracze</dt><dd>{snapshot.players.length}</dd></div>
            {activeSegment === "melodia" ? (
              <div><dt>Rozliczenie żetonów</dt><dd>{snapshot.melodia.settledAt ? "Zatwierdzone" : "Po piątej piosence"}</dd></div>
            ) : (
              <div><dt>Zakłady</dt><dd>{activeSegment === "alkoholicy" ? "Przed Kalamburami i pojedynkiem" : activeSegment === "familiada" ? "Przed każdym meczem" : activeSegment === "the-floor" || activeSegment === "sport" || activeSegment === "pojedynki" ? "Zależne od pojedynku" : "Brak w tym segmencie"}</dd></div>
            )}
          </dl>
        </article>
      </section>

      <section className="score-section">
        <div className="section-heading">
          <h2>Punkty drużyn</h2>
          <span className="poll-note">Odświeżanie co 4 sekundy</span>
        </div>
        <div className="score-grid">
          {TEAMS.map((team) => (
            <article className="score-card" key={team.id} style={{ "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties}>
              <span className="score-symbol">{team.icon}</span>
              <h3>{team.name}</h3>
              <strong>{pointsFor(team.id)}</strong>
              <span className="score-caption">punkty</span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-roster">
        <div className="section-heading">
          <div><span className="eyebrow">Skład stołu</span><h2>Gracze w drużynach</h2></div>
          <span className="poll-note">Odświeżanie co 4 sekundy</span>
        </div>
        <div className="admin-team-list">
          {TEAMS.map((team) => {
            const members = snapshot.players.filter((player) => player.teamId === team.id);
            return (
              <article className="admin-team-row" key={team.id} style={{ "--team-color": team.color } as CSSProperties}>
                <span className="admin-team-icon">{team.icon}</span>
                <div><h3>{team.name}</h3><p>{team.tagline}</p></div>
                <strong>{members.length}</strong>
                <span>{members.length === 1 ? "gracz" : "graczy"}</span>
                <div className="admin-names">{members.length ? members.map((member) => <span key={member.id}>{member.nickname}</span>) : <em>Brak graczy</em>}</div>
              </article>
            );
          })}
        </div>
        <div className="player-management-heading">
          <span className="eyebrow">Zarządzanie graczami</span>
          <h3>Salda i dostęp</h3>
        </div>
        <div className="player-management-list">
          {snapshot.players.map((player) => {
            const team = getTeam(player.teamId);
            const isEditing = editingPlayerId === player.id;
            return (
              <article className="player-management-row" key={player.id} style={{ "--team-color": team.color } as CSSProperties}>
                <div><strong>{player.nickname}</strong><span>{team.icon} {team.name}</span></div>
                {isEditing ? (
                  <label className="chip-editor">
                    <span className="sr-only">Nowe saldo żetonów dla {player.nickname}</span>
                    <input className="text-input" inputMode="decimal" value={chipValue} onChange={(event) => setChipValue(event.target.value)} />
                    <small>żetony</small>
                  </label>
                ) : <strong className="player-chip-balance">{formatChips(player.tokens)} <small>żetonów</small></strong>}
                <div className="player-management-actions">
                  {isEditing ? (
                    <>
                      <button className="secondary-button" type="button" onClick={() => saveChipBalance(player.id)} disabled={pendingAction !== null}>Zapisz saldo</button>
                      <button className="quiet-button" type="button" onClick={() => setEditingPlayerId(null)} disabled={pendingAction !== null}>Anuluj</button>
                    </>
                  ) : <button className="secondary-button" type="button" onClick={() => beginChipEdit(player.id, player.tokens)} disabled={pendingAction !== null}>Edytuj żetony</button>}
                  <button className="danger-button" type="button" onClick={() => removePlayer(player.id, player.nickname)} disabled={pendingAction !== null}>Usuń gracza</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
