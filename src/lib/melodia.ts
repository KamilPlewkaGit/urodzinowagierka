export const MELODIA_TITLE = "Jaka to melodia?";
export const MELODIA_LOSER_CONTRIBUTION = 5;
export const MELODIA_SONG_COUNT = 5;
export const MELODIA_MAX_SONG_POINTS = 2;

export function getMelodiaSongLabel(sequence: number) {
  return `PIOSENKA NR ${sequence + 1}`;
}
