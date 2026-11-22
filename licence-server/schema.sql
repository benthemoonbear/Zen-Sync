CREATE TABLE IF NOT EXISTS licences (key TEXT PRIMARY KEY, checkout_session TEXT UNIQUE, email TEXT, name TEXT, status TEXT NOT NULL DEFAULT 'active', payment_intent TEXT, mode TEXT NOT NULL DEFAULT 'test', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activations (id TEXT PRIMARY KEY, licence_key TEXT NOT NULL REFERENCES licences(key), instance_name TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS activations_by_key ON activations(licence_key);
CREATE INDEX IF NOT EXISTS licences_by_pi ON licences(payment_intent);
CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
