// Shapes shared by the decoder, the risk rules and the UI.
// Amounts are base-unit strings (bigint-safe); `decimals` says how to show them.

export type Severity = 'danger' | 'warn' | 'info' | 'ok';

export type EventKind =
	| 'sol_in'
	| 'sol_out'
	| 'token_in'
	| 'token_out'
	| 'approve'
	| 'revoke'
	| 'owner_change'
	| 'close_authority_change'
	| 'assign'
	| 'close_account'
	| 'memo'
	| 'program';

export interface WalletEvent {
	kind: EventKind;
	/** The other side: recipient, sender, delegate, new owner, program. */
	counterparty?: string;
	amount?: string;
	decimals?: number;
	mint?: string;
	/** Token account the event touched (needed to revoke a delegate). */
	tokenAccount?: string;
	/** Token program that owns tokenAccount (classic or Token-2022). */
	tokenProgram?: string;
	text?: string;
}

export type FindingKind =
	| 'poisoning'
	| 'sent_to_lookalike'
	| 'delegate_granted'
	| 'owner_changed'
	| 'close_authority_changed'
	| 'wallet_assigned'
	| 'phishing_memo'
	| 'dust'
	| 'large_outflow';

export interface Finding {
	kind: FindingKind;
	severity: Severity;
	/** Address the finding is about (poisoner, delegate, new owner…). */
	subject?: string;
	/** For lookalikes: the genuine address it imitates. */
	imitates?: string;
	mint?: string;
	amount?: string;
	decimals?: number;
	tokenAccount?: string;
	tokenProgram?: string;
	pct?: number;
	text?: string;
}

export interface TxLine {
	signature: string;
	slot: number;
	blockTime: number | null;
	failed: boolean;
	/** Lamports the wallet paid in fees (0 when someone else paid). */
	fee: number;
	events: WalletEvent[];
	findings: Finding[];
	/** Programs the transaction called, for the "what touched this" line. */
	programs: string[];
	/** Net balance change for the wallet per asset ('SOL' or mint), fee excluded. */
	net: NetChange[];
}

export interface NetChange {
	asset: string;
	delta: string;
	decimals: number;
}

export interface Delegation {
	tokenAccount: string;
	tokenProgram: string;
	mint: string;
	delegate: string;
	amount: string;
	decimals: number;
	/** Delegate may move the whole balance or more. */
	unlimited: boolean;
	balance: string;
}

export interface Report {
	address: string;
	scannedAt: number;
	lines: TxLine[];
	delegations: Delegation[];
	/** False when the node refused the token-account scan; the UI must say so. */
	delegationsChecked: boolean;
	/** Addresses this wallet has sent to in the scanned window. */
	counterparties: string[];
	/** Senders flagged as lookalikes. */
	poisoners: string[];
	verdict: Severity;
	counts: Record<Severity, number>;
	/** True when the RPC gave us fewer transactions than asked (whole history seen). */
	complete: boolean;
	source: 'solami' | 'fallback';
	lamports: number;
}
