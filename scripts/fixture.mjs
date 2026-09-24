// Save a real mainnet transaction (jsonParsed) as a test fixture.
// Usage: node scripts/fixture.mjs <wallet> <index> <name>
import { writeFileSync } from 'node:fs';
const [wallet, idx, name] = process.argv.slice(2);
const rpc = 'https://solana-rpc.publicnode.com';
const call = async (m, p) => (await (await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json()).result;
const sigs = await call('getSignaturesForAddress', [wallet, { limit: Number(idx) + 1 }]);
const tx = await call('getTransaction', [sigs[Number(idx)].signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
writeFileSync(`src/lib/engine/fixtures/${name}.json`, JSON.stringify({ wallet, tx }, null, 1));
console.log(name, sigs[Number(idx)].signature, JSON.stringify(tx).length);
