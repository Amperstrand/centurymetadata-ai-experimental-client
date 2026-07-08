// Cloudflare Pages Function — CORS proxy for the centurymetadata test API.
//
// The upstream (testapi.centurymetadata.org) sends no CORS headers, so direct
// browser requests are blocked. This forwards /cm/* → upstream and adds
// Access-Control-Allow-Origin: * to the response. The SPA calls /cm/api/v1/*
// (same-origin on the Pages deployment), so no preflight is triggered for the
// app's own calls; the OPTIONS handler + CORS header exist for robustness.
//
// Matches the original proxy at blossomflare's src/routes/centurymetadata.ts.

const UPSTREAM = 'https://testapi.centurymetadata.org';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequest: PagesFunction = async (ctx) => {
  const u = new URL(ctx.request.url);
  const proxyPath = u.pathname.replace(/^\/cm/, '') + u.search;

  const init: RequestInit = {
    method: ctx.request.method,
    headers: { 'Content-Type': ctx.request.headers.get('content-type') || 'application/octet-stream' },
  };

  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
    init.body = await ctx.request.arrayBuffer();
  }

  const res = await fetch(`${UPSTREAM}${proxyPath}`, init);
  const body = await res.arrayBuffer();

  return new Response(body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      ...CORS_HEADERS,
    },
  });
};
