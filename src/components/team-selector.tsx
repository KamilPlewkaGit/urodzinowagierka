"use client";

import type { CSSProperties } from "react";

import { TEAMS } from "@/lib/constants";
import type { TeamId } from "@/lib/types";

interface TeamSelectorProps {
  value: TeamId;
  onChange: (teamId: TeamId) => void;
  disabled?: boolean;
}

export function TeamSelector({ value, onChange, disabled = false }: TeamSelectorProps) {
  return (
    <fieldset className="team-fieldset" disabled={disabled}>
      <legend>Wybierz drużynę</legend>
      <div className="team-grid">
        {TEAMS.map((team) => {
          const selected = team.id === value;
          const theme = { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
          return (
            <button
              type="button"
              key={team.id}
              className={`team-choice ${selected ? "is-selected" : ""}`}
              style={theme}
              onClick={() => onChange(team.id)}
              aria-pressed={selected}
            >
              <span className="team-icon" aria-hidden="true">{team.icon}</span>
              <span className="team-choice-copy">
                <strong>{team.name}</strong>
                <small>{team.tagline}</small>
              </span>
              <span className="team-check" aria-hidden="true">{selected ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
