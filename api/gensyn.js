// api/gensyn.js
export const config = { runtime: 'edge' };

const MAP = {
  'nodes-connected': 'https://dashboard.gensyn.ai/api/v1/nodes-connected',
  'network-stats':   'https://dashboard.gensyn.ai/api/v1/network-stats',
  'leaderboard':     'https://dashboard.gensyn.ai/api/v1/leaderboard'
};

// helpers to normalize stats
const pickNum = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

// accept numbers or strings like "2s", "1500ms", "1500000000ns"
function toSecondsMaybe(x) {
  if (x == null) return null;
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string') {
    const v = x.trim().toLowerCase();
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);        // "2" -> 2s
    const s  = v.match(/^(-?\d+(\.\d+)?)\s*s$/);            // "2s"
    if (s) return Number(s[1]);
    const ms = v.match(/^(-?\d+(\.\d+)?)\s*ms$/);           // "1500ms"
    if (ms) return Number(ms[1]) / 1000;
    const ns = v.match(/^(-?\d+(\.\d+)?)\s*ns$/);           // "1500000000ns"
    if (ns) return Number(ns[1]) / 1e9;
  }
  return null;
}

function extractAvgBlockTimeSeconds(stats) {
  if (!stats || typeof stats !== 'object') return null;

  // include camelCase "averageBlockTimeSeconds"
  let s =
    toSecondsMaybe(stats.averageBlockTimeSeconds) ??
    toSecondsMaybe(stats.avg_block_time) ??
    toSecondsMaybe(stats.avgBlockTime) ??
    toSecondsMaybe(stats.average_block_time) ??
    toSecondsMaybe(stats.averageBlockTime) ??
    toSecondsMaybe(stats.avg_block_time_seconds) ??
    toSecondsMaybe(stats.average_block_time_seconds) ??
    toSecondsMaybe(stats.block_time) ??
    toSecondsMaybe(stats.block_time_seconds);

  if (s == null) {
    const ms = toSecondsMaybe(
      (typeof stats.avg_block_time_ms !== 'undefined') ? `${stats.avg_block_time_ms}ms` :
      (typeof stats.block_time_ms     !== 'undefined') ? `${stats.block_time_ms}ms` : null
    );
    const ns = toSecondsMaybe(
      (typeof stats.avg_block_time_nanos !== 'undefined') ? `${stats.avg_block_time_nanos}ns` :
      (typeof stats.block_time_nanos     !== 'undefined') ? `${stats.block_time_nanos}ns` : null
    );
    s = ms ?? ns ?? null;
  }
  return s;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  // Normalized summary for the frontend
  if (path === 'summary') {
    try {
      const [ncRes, nsRes] = await Promise.all([
        fetch(MAP['nodes-connected'], { headers: { 'user-agent': 'Mozilla/5.0' } }),
        fetch(MAP['network-stats'],   { headers: { 'user-agent': 'Mozilla/5.0' } })
      ]);

      const nodesJson = ncRes.ok ? await ncRes.json() : {};
      const statsJson = nsRes.ok ? await nsRes.json() : {};

      const avgBlockTimeSec = extractAvgBlockTimeSeconds(statsJson);

      const completedTx =
        pickNum(statsJson.completedTransactions) ??      // <- camelCase from your screenshot
        pickNum(statsJson.completed_transactions) ??
        pickNum(statsJson.completed_tx) ?? null;

      const nodesConnected =
        pickNum(nodesJson.nodes_connected) ??
        pickNum(nodesJson.nodesConnected) ??
        pickNum(nodesJson.count) ?? null;

      return new Response(
        JSON.stringify({ avgBlockTimeSec, completedTx, nodesConnected }),
        { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }
      );
    } catch {
      return new Response(JSON.stringify({ error: 'summary_failed' }), {
        status: 502, headers: { 'content-type': 'application/json' }
      });
    }
  }

  // Passthrough for raw endpoints
  const target = MAP[path];
  if (!target) {
    return new Response(JSON.stringify({ error: 'unknown_path' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0' } });
    return new Response(r.body, {
      status: r.status,
      headers: {
        'content-type': r.headers.get('content-type') || 'application/json',
        'cache-control': 'public, s-maxage=20, stale-while-revalidate=60',
        'access-control-allow-origin': '*'
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'upstream_failed' }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  }
}
