export const MELODIA_TITLE = "Jaka to melodia?";
export const MELODIA_REWARD = 4;
export const MELODIA_SONG_COUNT = 5;
export const MELODIA_MAX_SINGING_POINTS = 5;
export const MELODIA_MAX_SONG_POINTS = 7;

export function getMelodiaSongLabel(sequence: number) {
  return `PIOSENKA NR ${sequence + 1}`;
}
