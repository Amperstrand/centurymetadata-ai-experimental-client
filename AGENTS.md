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


## Observability / Workers Logs policy — 2026-09 cost incident

**What happened (2026-09-05):** the Cloudflare account (b8b395a6029fc23bcc4f4ac31fcd1f1c) crossed its $25 usage alert mid-month. Root cause: Workers Logs ingestion — observability left at/near max (head_sampling_rate 1.0, logs + traces + invocation_logs all on) across dozens of deployed workers produced ~54M log events/month against the 20M free tier (≈$0.60 per additional million). Biggest burners: the cashu-mint-* cluster under continuous loop traffic (cashu-mint-signet alone ~7.4M events/week) and boltz-bridge-* at sampling 1.0.

**State since 2026-09-05:** observability is hard-zeroed on ALL workers in this account — via the Cloudflare API (live settings) and in every wrangler config in this repo (`observability.enabled = false`, head_sampling_rate 0, logs/traces/invocation_logs off). This is deliberate for the rest of billing month September 2026. Historical sampling values are recoverable from git history.

**Rules for agents working here:**
1. Do not deploy with observability enabled or with raised sampling "for visibility". Default is OFF/0 everywhere.
2. Debugging: enable selectively — only the specific worker being debugged, lowest rate that gives signal (start 0.05–0.1), `invocation_logs: true` only if truly needed — and zero it again in the same PR or an immediate follow-up.
3. Never leave head_sampling_rate at/near 1.0 on a deployed worker; on a busy worker that alone costs real money (see incident above).
4. When planning features/deployments, budget log volume explicitly: estimated events/month ≈ requests/month × log lines/request × sampling rate, checked against the 20M account-wide free tier.
5. After any deploy that touches logging, check Workers & Pages → Observability and the billing usage page; budget alerts are configured on the account.

Workers deployed from this repo: none currently deployed (wrangler config present)
