export function formatChips(value: string) {
  const normalized = value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return normalized === "-0" ? "0" : normalized;
}

export function formatPolishChips(value: string) {
  return formatChips(value).replace(".", ",");
}

function balanceUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(4, "0"));
}

export function compareChipBalances(first: string, second: string) {
  const difference = balanceUnits(first) - balanceUnits(second);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
