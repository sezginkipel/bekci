// Pick a few real, ordinary wallets: fee payers of recent USDC transfers.
const rpc='https://solana-rpc.publicnode.com';
const call=async(m,p)=>(await (await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})})).json()).result;
const sigs=await call('getSignaturesForAddress',['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',{limit:15}]);
const out=new Set();
for(const s of sigs){const tx=await call('getTransaction',[s.signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:0}]); const k=tx?.transaction?.message?.accountKeys?.[0]; if(k) out.add(k.pubkey);}
console.log([...out].join('\n'));
