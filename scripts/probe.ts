// Manual probe: scan a real mainnet wallet and print the report summary.
// Usage: npx tsx scripts/probe.ts <address> [limit]
import { makeRpc } from '../src/lib/chain/rpc';
import { scanWallet } from '../src/lib/chain/scan';

const [addr, limit] = process.argv.slice(2);
const rpc = makeRpc({ SOLAMI_API_KEY: process.env.SOLAMI_API_KEY, FALLBACK_RPC: process.env.FALLBACK_RPC });
const t0 = Date.now();
const r = await scanWallet(rpc, addr, Number(limit ?? 25));
console.log(JSON.stringify({ ms: Date.now() - t0, source: r.source, verdict: r.verdict, counts: r.counts, lines: r.lines.length, delegations: r.delegations, poisoners: r.poisoners, cps: r.counterparties.length }, null, 1));
for (const l of r.lines.slice(0, 40)) console.log(l.signature.slice(0, 8), l.failed ? 'FAIL' : '', l.events.map((e) => `${e.kind}:${(e.counterparty ?? '').slice(0, 6)}:${e.amount ?? ''}${e.mint ? ':' + e.mint.slice(0, 4) : ''}`).join(' '), l.findings.map((f) => f.kind + '/' + f.severity).join(','));
