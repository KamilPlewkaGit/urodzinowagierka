export function formatChips(value: string) {
  const normalized = value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return normalized === "-0" ? "0" : normalized;
}
