-- Cloudflare D1 Schema for TC-Block YouTube Blocker

CREATE TABLE IF NOT EXISTS blocked_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_handle TEXT UNIQUE NOT NULL, -- e.g. @kenh-xau (normalized lowercase)
    channel_name TEXT NOT NULL,         -- Display name
    channel_url TEXT,                   -- Full URL
    reason TEXT NOT NULL,               -- Latest report reason
    report_count INTEGER DEFAULT 1,     -- Number of reports received
    status TEXT DEFAULT 'active',       -- 'active' | 'inactive'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_handle TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    reporter_ip_hash TEXT,              -- SHA-256 hash for basic anti-spam rate limiting
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blocked_handle ON blocked_channels(channel_handle);
CREATE INDEX IF NOT EXISTS idx_reports_handle ON reports(channel_handle);
