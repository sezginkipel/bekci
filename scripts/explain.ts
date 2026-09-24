// Print every finding and live delegation for one wallet.
import { makeRpc } from '../src/lib/chain/rpc';
import { scanWallet } from '../src/lib/chain/scan';
const r = await scanWallet(makeRpc({}), process.argv[2], 40);
console.log('delegations', JSON.stringify(r.delegations));
for (const l of r.lines) for (const f of l.findings) console.log(l.signature.slice(0, 10), l.programs.join(','), JSON.stringify(f), JSON.stringify(l.events.slice(0, 3)));
