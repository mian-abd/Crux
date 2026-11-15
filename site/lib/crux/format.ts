// Number and text formatting shared by the panels.

export function pct(p: number): string {
  const v = Math.max(0, Math.min(1, p)) * 100;
  if (v > 0 && v < 1) return `${v.toFixed(1)}%`;
  if (v > 99 && v < 100) return `${v.toFixed(1)}%`;
  return `${Math.round(v)}%`;
}

export function usd(v: number): string {
  if (v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 10) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

export function bits(v: number): string {
  return v >= 10 ? v.toFixed(1) : v.toFixed(2);
}

export function compact(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (v >= 100) return Math.round(v).toString();
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function value(v: string | number | null): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);
}

/** "https://www.example.org/a/b?c" -> "example.org/a/b" */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return url;
  }
}

export function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
