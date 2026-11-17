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
        setError(payload?.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.replace(isAdmin ? "/admin" : "/lobby");
      router.refresh();
    } catch {
      setError("Unable to reach the table. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="join-panel" onSubmit={submit} noValidate>
      <div className="form-heading">
        <span className="eyebrow">Seat reservation</span>
        <h2>{isAdmin ? "Command table access" : "Claim your seat"}</h2>
        <p>{isAdmin ? "Enter the administrator password. Administrators do not join a house." : "Pick a name, choose your house, and receive 100 chips."}</p>
      </div>

      <label className="field-label" htmlFor="nickname">Nickname</label>
      <input
        id="nickname"
        className="text-input"
        name="nickname"
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        minLength={2}
        maxLength={24}
        autoComplete="nickname"
        placeholder="e.g. LuckyAce"
        required
      />

      {isAdmin ? (
        <div className="admin-password-wrap">
          <label className="field-label" htmlFor="admin-password">Administrator password</label>
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
        <TeamSelector value={teamId} onChange={setTeamId} />
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="gold-button join-button" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? "Taking your seat…" : isAdmin ? "Unlock command table" : "Join the game"}</span>
        <span aria-hidden="true">→</span>
      </button>
      <p className="form-footnote">Virtual chips only · No real-money play</p>
    </form>
  );
}
