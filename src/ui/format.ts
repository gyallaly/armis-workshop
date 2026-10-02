export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function shortClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function relTime(now: number, at: number): string {
  const s = Math.round((now - at) / 1000);
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
