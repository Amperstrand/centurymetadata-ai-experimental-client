# AGENTS.md

Agent context for `centurymetadata-ai-experimental-client`.
README is the source of truth for what the app does and how to run it locally — read it first.
This file captures only what sessions keep rediscovering and the non-obvious gotchas.

## Deploy contract (the thing every session re-derives)

This is a **Cloudflare Pages** project (static SPA + Pages Function CORS proxy at `functions/cm/[[path]].ts`). Not a Worker.

**Manual (fallback only):**
```bash
npm run build
npx wrangler pages deploy dist --project-name centurymetadata-ai-experimental-client
```

**CI auto-deploys on push to `main`**, gated on the `test` job (`.github/workflows/ci.yml`, `deploy` job with `needs: test`). This is the intended path — **do not run manual deploys unless CI is broken.** A push to `main` ships itself once tests pass.

The deploy job needs two GitHub secrets (both set 2026-07-30):
- `CLOUDFLARE_API_TOKEN` — scoped token, **Pages Read + Pages Write only**
- `CLOUDFLARE_ACCOUNT_ID`

If a CI deploy fails with `Authentication error [code: 10000]` on the pages endpoint, the token lacks the Pages permission — re-mint (see below).

## Minting / refreshing the deploy token

The token lives in macOS keychain as `cf-centurymetadata-ai-experimental-client-deploy`.

```bash
# Read it (don't echo):
security find-generic-password -a "$USER" -s cf-centurymetadata-ai-experimental-client-deploy -w

# Propagate to GitHub after rotation:
gh secret set CLOUDFLARE_API_TOKEN \
  --body "$(security find-generic-password -a "$USER" -s cf-centurymetadata-ai-experimental-client-deploy -w)"
```

The mint helper is `../hackathon-tooling/scripts/create-scoped-token.sh`, but **its default scope (Workers/D1/R2/KV/Queues/AI) does NOT include the Cloudflare Pages permission** and will produce a token that authenticates yet fails on every `pages` call. Known gap. For this project, mint a Pages-only token (least privilege) — see the Cloudflare API: permission group "Pages Write" (`8d28297797f24fb8a0c332fe0866ec89`) + "Pages Read" (`e247aedd66bd41cc9193af0213416666`), account-scoped.

Do not authenticate as a personal account for deploys. Use the keychain token locally or the GitHub secrets in CI.

## Tests — the spec-drift caveat

```bash
npm run test:unit      # 33 unit tests — verifies crypto primitives. Always green.
npm run test:roundtrip # encode→upload→fetch→decode against testapi.centurymetadata.org
SERVER=<url> npm run test:e2e  # Playwright (gated in CI)
```

**`test:roundtrip` is expected to FAIL until upstream redeploys.** The public test API lags master: it serves the pre-2026-07-08 preamble and rejects the current format with HTTP 400. This is upstream drift, not a regression here — do not "fix" it by reverting the wire format. See `docs/SPEC-DRIFT.md`.

Two pre-existing Playwright timing tests are marked `.fixme` (commits `67ea968`, `8a8bd7e`) — 98/100 pass. This is the known floor, not a failure to investigate on every run.

## Don't

- Don't migrate to GitHub Pages to "simplify" — see issue #2 (the CORS proxy needs a server-side runtime; GH Pages is static-only). The README "Why Cloudflare Pages?" note and issue #2 both conclude the current setup is already the simplest answer.
- Don't add the personal wrangler-login email anywhere in this repo.
