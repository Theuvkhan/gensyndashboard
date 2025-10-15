// api/gensyn.js
export const config = { runtime: 'edge' };

const MAP = {
  'nodes-connected': 'https://dashboard.gensyn.ai/api/v1/nodes-connected',
  'network-stats':   'https://dashboard.gensyn.ai/api/v1/network-stats',
  'leaderboard':     'https://dashboard.gensyn.ai/api/v1/leaderboard'
};

// helpers to normalize stats
const pickNum = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

function extractAvgBlockTimeSeconds(stats) {
  if (!stats || typeof stats !== 'object') return null;

  // seconds candidates
  let s =
    pickNum(stats.avg_block_time) ??
    pickNum(stats.avgBlockTime) ??
    pickNum(stats.average_block_time) ??
    pickNum(stats.averageBlockTime) ??
    pickNum(stats.avg_block_time_seconds) ??
    pickNum(stats.average_block_time_seconds) ??
    pickNum(stats.block_time) ??
    pickNum(stats.block_time_seconds);

  // millis / nanos fallback
  if (s == null) {
    s =
      pickNum((stats.avg_block_time_ms ?? stats.block_time_ms) / 1000) ??
      pickNum((stats.avg_block_time_nanos ?? stats.block_time_nanos) / 1e9) ??
      null;
  }
  return s;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  // NEW: normalized summary for the frontend
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
        pickNum(statsJson.completed_transactions) ??
        pickNum(statsJson.completedTransactions) ??
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

  // Existing passthrough for the 3 public endpoints
  const target = MAP[path];
  if (!target) {
    return new Response(JSON.stringify({ error: 'unknown_path' }), {
