export function todayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

export function daysRemaining(targetISO: string): number {
  const todayISO = todayStr();
  return daysBetween(todayISO, targetISO);
}

export function formatCountdownLabel(days: number): string {
  if (days > 0) return `${days} days remaining`;
  if (days === 0) return "Today";
  return `${Math.abs(days)} days overdue`;
}