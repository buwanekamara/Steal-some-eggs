const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** Short random id for anything saved that needs one (backpack eggs, pen eggs, pets, …). */
export function newUid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 1234 → "1.2K", 50_700 → "50.7K", 15_400_000 → "15.4M" (the reference HUD style). */
export function formatShort(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n < 1000) return sign + (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / 10 ** (tier * 3);
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "");
  return sign + s + SUFFIXES[tier];
}
