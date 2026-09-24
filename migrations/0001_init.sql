-- Watches: one row per (address, email). Double opt-in: pending → active.
CREATE TABLE watches (
	id TEXT PRIMARY KEY,
	address TEXT NOT NULL,
	email TEXT NOT NULL,
	lang TEXT NOT NULL DEFAULT 'en',
	status TEXT NOT NULL DEFAULT 'pending', -- pending | active | stopped
	token TEXT NOT NULL UNIQUE,              -- confirm + stop link secret
	ip_hash TEXT,
	created_at INTEGER NOT NULL,
	confirmed_at INTEGER,
	stopped_at INTEGER,
	UNIQUE (address, email)
);
CREATE INDEX watches_address ON watches (address, status);
CREATE INDEX watches_email ON watches (email, status);
CREATE INDEX watches_ip ON watches (ip_hash, created_at);

-- Per watched address: where the watcher stopped reading, and who the owner
-- really pays (the genuine set lookalikes are measured against).
CREATE TABLE cursors (
	address TEXT PRIMARY KEY,
	last_signature TEXT,
	counterparties TEXT NOT NULL DEFAULT '[]',
	checked_at INTEGER
);

-- Every alert once per (address, signature, kind); also the public audit of what we sent.
CREATE TABLE alerts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	address TEXT NOT NULL,
	signature TEXT NOT NULL,
	kind TEXT NOT NULL,
	severity TEXT NOT NULL,
	subject TEXT,
	via TEXT NOT NULL,                        -- poll | webhook
	created_at INTEGER NOT NULL,
	UNIQUE (address, signature, kind)
);
CREATE INDEX alerts_address ON alerts (address, created_at);

CREATE TABLE mail_log (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kind TEXT NOT NULL,                       -- confirm | alert
	watch_id TEXT,
	ok INTEGER NOT NULL,
	error TEXT,
	created_at INTEGER NOT NULL
);

-- Small key/value for operational state (Solami webhook id + signing secret).
CREATE TABLE meta (
	k TEXT PRIMARY KEY,
	v TEXT NOT NULL
);
