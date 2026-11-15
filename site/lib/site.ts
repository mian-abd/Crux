export const REPO_URL = "https://github.com/mian-abd/Crux";

export function repoFile(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}

/** The run viewer (web/), which replays graded Task 9 runs from their event logs. */
export const VIEWER_URL = process.env.NEXT_PUBLIC_CRUX_VIEWER ?? "https://crux-viewer-production.up.railway.app";

export function viewerReplay(file: string, speed = 8): string {
  return `${VIEWER_URL}/?apireplay=${encodeURIComponent(file)}&speed=${speed}`;
}

/** An event log bundled with the viewer (web/public/fixtures), replayed in the browser. */
export function viewerFixture(name: string, speed = 1): string {
  return `${VIEWER_URL}/?replay=${encodeURIComponent(name)}&speed=${speed}`;
}
