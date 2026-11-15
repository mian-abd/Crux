# Deploying Crux (Railway)

Two services from this repo, plus Modal for the sandboxes:

| Service | Built from | What it serves |
| --- | --- | --- |
| `crux-api` | `Dockerfile.api` at the repo root | The engine API (`api/server.py`): the recorded replays in `runs/demo/`, live claims audits run in-process, and the event streams the site reads |
| `crux-site` | `site/Dockerfile` | The consumer site: landing, accounts, paper upload, run pages, the 3D Explore gallery |

Task 9 runs execute R and DESeq2 in network-blocked Modal sandboxes, which Railway does not provide. The API starts them in Modal only if it has the keys below.

## Safe public defaults

- **`crux-api` without `OPENAI_API_KEY` or Modal tokens.** The free claims audit (about 8 s, $0) and the recorded replays work. A Task 9 run can't spend money: it fails without the keys.
- **`crux-site` without `OPENAI_API_KEY`.** Paper upload and accounts work. Claim extraction shows its "extraction needs an API key" state instead of letting anyone with an account spend your OpenAI budget. Add the key only behind an invite gate.

**The current deploy differs on one point:** `crux-site` has `OPENAI_API_KEY`, so claim extraction from an uploaded paper works for anyone with an account. Each extraction is one gpt-4.1-mini call (about a cent for a typical paper). Keep a spend limit on the OpenAI project, and remove the variable or rotate the key after the event. `crux-api` holds `OPENAI_API_KEY`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `EXA_API_KEY`, `PAST_API_KEY` and the Langfuse keys, and `CRUX_TASK9_CASES=/app/runs/demo/cases`, where the image ships the clean Task 9 case's staging manifest (a bundle id and file digests; the inputs are already on the Modal volume, and no truth key is included). Paid runs sit behind a team token: with `CRUX_RUN_TOKEN` set, `POST /runs` for `bixbench3` needs a matching `X-Crux-Run-Token` header and answers 403 without it (`api/server.py`, `paid_run_allowed`). The claims, fake and One Letter labs stay open. The token is in the team's local `.env`; start a run with:

```sh
curl -X POST https://crux-api-production-fef3e0e8.up.railway.app/runs -H "Content-Type: application/json" \n  -H "X-Crux-Run-Token: $CRUX_RUN_TOKEN" -d '{"lab": "bixbench3", "overrides": {"case": "task9-clean"}}'
```

Watch it at `https://crux-viewer-production.up.railway.app/?run=<run_id>`.

**From the site.** `crux-site` also holds `CRUX_RUN_TOKEN` (server-only), so a signed-in user can start the same run from **Live run** (`/app/live`) and watch it at `/app/live/<run_id>`: a status panel that polls the API, and the viewer embedded below it. The site's server adds the token; it never reaches the browser. Fair-use limits are checked and a slot reserved in one SQLite transaction before the API is called: 3 runs per account per day, 20 per day across the site and 2 at once (`LIVE_RUNS_PER_USER_PER_DAY`, `LIVE_RUNS_PER_DAY`, `LIVE_RUNS_CONCURRENT`; `site/lib/server/live-runs.ts`). Worst case at those limits: 20 runs, about $40 of model spend a day, plus Modal compute. Each run is capped at $2 of model spend, plus Modal compute. Rotate every key after the event, and delete these variables to go back to the safe defaults above.

## Variables

`crux-api`:
- `RAILWAY_DOCKERFILE_PATH=Dockerfile.api`
- `CRUX_CORS_ORIGINS=https://<crux-site domain>`
- Optional, for paid runs: `OPENAI_API_KEY`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, Langfuse keys.

`crux-site`:
- `NEXT_PUBLIC_CRUX_API=https://<crux-api domain>`. This is read at **build** time, so redeploy after changing it.
- `BETTER_AUTH_URL=https://<crux-site domain>`
- `BETTER_AUTH_SECRET=<32+ random characters>`
- A **volume mounted at `/app/.data`** for the SQLite accounts database and the uploads. Keep one replica, since the volume and SQLite assume a single writer.

## Steps (Railway CLI)

```sh
railway init --name crux                      # a new, separate project
railway add --service crux-api
railway variables --service crux-api --set RAILWAY_DOCKERFILE_PATH=Dockerfile.api
railway up --service crux-api --detach        # from the repo root
railway domain --service crux-api             # note the URL

railway add --service crux-site
railway variables --service crux-site --set NEXT_PUBLIC_CRUX_API=https://<api> \
  --set BETTER_AUTH_URL=https://<site> --set BETTER_AUTH_SECRET=<random>
railway volume add --service crux-site --mount-path /app/.data
railway up site --path-as-root --service crux-site --detach
railway domain --service crux-site

railway variables --service crux-api --set CRUX_CORS_ORIGINS=https://<site>
```

Live runs on `crux-api` are kept in the container and lost on redeploy. The recorded demo runs ship with the image.

## Auto-deploy from GitHub

Both services are connected to `main`, so every merge redeploys them:

```sh
railway service source connect --repo mian-abd/Crux --branch main --service crux-api
railway service source connect --repo mian-abd/Crux --branch main --service crux-site
```

`crux-site` needs its root directory set to `/site` (its Dockerfile copies from there). A watch path of `/site/**` keeps API-only commits from rebuilding it. Both are service settings: set them in the dashboard (Settings, Source), or with `railway api` and the `serviceInstanceUpdate` mutation (`rootDirectory`, `watchPatterns`). `crux-api` finds `Dockerfile.api` through `RAILWAY_DOCKERFILE_PATH` and rebuilds on any change.

## The run viewer (third service)

`crux-viewer` serves `web/` (the engineering run viewer) as a static site from `web/Dockerfile`, with root directory `/web`, watch path `/web/**` and `VITE_API_URL` set to the API (read at build time). The API's `CRUX_CORS_ORIGINS` lists both the site and the viewer, comma-separated. Deep links: `?apireplay=<file in runs/demo>&speed=8`.

## Where it runs now

- Site: https://crux-site-production-95830f5f.up.railway.app
- Run viewer: https://crux-viewer-production.up.railway.app
- API: https://crux-api-production-fef3e0e8.up.railway.app (`/health`, `/replays`)
