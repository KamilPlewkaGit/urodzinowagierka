"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { TeamSelector } from "@/components/team-selector";
import type { TeamId } from "@/lib/types";

type ApiError = { error?: string };

export function RegistrationForm() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [teamId, setTeamId] = useState<TeamId>("royal");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = useMemo(() => nickname.trim().toLocaleLowerCase() === "admin", [nickname]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const endpoint = isAdmin ? "/api/admin/login" : "/api/auth/register";
      const body = isAdmin ? { password } : { nickname, teamId };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) {
        setError(payload?.error ?? "Coś poszło nie tak. Spróbuj ponownie.");
        return;
      }
      router.replace(isAdmin ? "/admin" : "/lobby");
      router.refresh();
    } catch {
      setError("Nie udało się połączyć ze stołem. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="join-panel" onSubmit={submit} noValidate>
      <div className="form-heading">
        <span className="eyebrow">Rezerwacja miejsca</span>
        <h2>{isAdmin ? "Dostęp dla prowadzącego" : "Zajmij miejsce"}</h2>
        <p>{isAdmin ? "Wpisz hasło prowadzącego. Prowadzący nie dołącza do drużyny." : "Nowy pseudonim wymaga wyboru drużyny i otrzymuje 100 żetonów. Wpisanie istniejącego pseudonimu przywraca jego wcześniejsze miejsce przy stole."}</p>
      </div>

      <label className="field-label" htmlFor="nickname">Pseudonim</label>
      <input
        id="nickname"
        className="text-input"
        name="nickname"
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        minLength={2}
        maxLength={24}
        autoComplete="nickname"
        placeholder="np. SzczęśliwyAs"
        required
      />

      {isAdmin ? (
        <div className="admin-password-wrap">
          <label className="field-label" htmlFor="admin-password">Hasło prowadzącego</label>
          <input
            id="admin-password"
            className="text-input"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
      ) : (
        <>
          <TeamSelector value={teamId} onChange={setTeamId} />
          <p className="form-footnote">Jeśli wracasz, wybór drużyny zostanie zastąpiony Twoją zapisaną drużyną.</p>
        </>
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="gold-button join-button" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? "Trwa zajmowanie miejsca…" : isAdmin ? "Otwórz panel prowadzącego" : "Dołącz do gry"}</span>
        <span aria-hidden="true">→</span>
      </button>
      <p className="form-footnote">Wyłącznie wirtualne żetony · Bez gry o prawdziwe pieniądze</p>
    </form>
  );
}
