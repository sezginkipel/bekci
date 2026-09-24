// Look for real address-poisoning cases on mainnet: scan recent USDC senders.
// Usage: npx tsx scripts/hunt.ts [wallets]
import { makeRpc } from '../src/lib/chain/rpc';
import { scanWallet } from '../src/lib/chain/scan';

const rpc = makeRpc({});
const want = Number(process.argv[2] ?? 40);
const seen = new Set<string>();
const sigs: any[] = await rpc.call('getSignaturesForAddress', ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', { limit: 200 }]);
let scanned = 0;
for (const s of sigs) {
	if (scanned >= want) break;
	const tx: any = await rpc.call('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]).catch(() => null);
	const payer = tx?.transaction?.message?.accountKeys?.[0]?.pubkey;
	if (!payer || seen.has(payer)) continue;
	// Skip bots/programs-heavy payers: ordinary wallets have plain transfers.
	const plain = (tx.transaction.message.instructions as any[]).every((i) => ['spl-token', 'system', 'spl-associated-token-account', 'spl-memo', undefined].includes(i.program) || i.programId?.startsWith('ComputeBudget'));
	if (!plain) continue;
	seen.add(payer);
	scanned++;
	try {
		const r = await scanWallet(rpc, payer, 40);
		const hits = r.lines.flatMap((l) => l.findings.filter((f) => f.kind === 'poisoning' || f.kind === 'sent_to_lookalike').map((f) => `${f.kind} ${f.subject} imitates ${f.imitates} in ${l.signature}`));
		console.log(scanned, payer, r.verdict, JSON.stringify(r.counts), hits.length ? '\n   ' + hits.join('\n   ') : '');
	} catch (e) {
		console.log(scanned, payer, 'ERR', (e as Error).message);
	}
}
