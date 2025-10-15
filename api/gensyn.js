// api/gensyn.js
export const config = { runtime: 'edge' };

const MAP = {
  'nodes-connected': 'https://dashboard.gensyn.ai/api/v1/nodes-connected',
  'network-stats':   'https://dashboard.gensyn.ai/api/v1/network-stats',
  'leaderboard':     'https://dashboard.gensyn.ai/api/v1/leaderboard'
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');
  const target = MAP[path];
  if (!target) {
    return new Response(JSON.stringify({ error: 'unknown_path' }), { status: 400, headers: {'content-type':'application/json'} });
  }

  try {
    const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0' } });
    return new Response(r.body, {
      status: r.status,
      headers: {
        'content-type': r.headers.get('content-type') || 'application/json',
        // cache in the edge for a bit, but always fresh for browser
        'cache-control': 'public, s-maxage=20, stale-while-revalidate=60',
        'access-control-allow-origin': '*'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream_failed' }), { status: 502, headers: {'content-type':'application/json'} });
  }
}
