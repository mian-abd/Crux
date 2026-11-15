export const REPO_URL = "https://github.com/mian-abd/Crux";

export function repoFile(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}
