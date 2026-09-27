-- Apply to fresh AND existing databases. Legacy tables remain for audit but are
-- never published: their channels were not moderated and reporters not verified.
CREATE TABLE IF NOT EXISTS reporters (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS moderation_channels (
    channel_handle TEXT PRIMARY KEY,
    channel_name TEXT NOT NULL,
    channel_url TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    moderation_note TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS community_reports (
    channel_handle TEXT NOT NULL REFERENCES moderation_channels(channel_handle),
    reporter_id TEXT NOT NULL REFERENCES reporters(id),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_handle, reporter_id)
);
CREATE TABLE IF NOT EXISTS moderation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_handle TEXT NOT NULL REFERENCES moderation_channels(channel_handle),
    status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_community_reports_time ON community_reports(reporter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_channels(status);

-- Additive security upgrade. Old reporter tokens are disabled until admin rotates
-- them: credentials without an explicit expiry are not accepted by the API.
CREATE TABLE IF NOT EXISTS reporter_credentials (
    reporter_id TEXT PRIMARY KEY REFERENCES reporters(id),
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS security_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS public_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO public_state (id, revision) VALUES (1, 0);
CREATE INDEX IF NOT EXISTS idx_moderation_public ON moderation_channels(status, channel_handle);
CREATE INDEX IF NOT EXISTS idx_reports_recent ON community_reports(channel_handle, created_at, reporter_id);
