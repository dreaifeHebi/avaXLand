/** 链上派生表只由索引器写；pending_content 与 accounts.name 由网关写；其余只读。金额列是 USDC 最小单位的整数。 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT,
  tier INTEGER NOT NULL DEFAULT 0,
  minted_tx TEXT,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS accounts_owner ON accounts(owner);

CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER NOT NULL,
  root_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  kind INTEGER NOT NULL,
  excerpt TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  full_text TEXT,
  fee INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS nodes_root ON nodes(root_id);
CREATE INDEX IF NOT EXISTS nodes_author ON nodes(author_id);

CREATE TABLE IF NOT EXISTS likes (
  node_id INTEGER NOT NULL,
  by_account INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (node_id, by_account)
);
CREATE INDEX IF NOT EXISTS likes_by ON likes(by_account);

CREATE TABLE IF NOT EXISTS splits (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  to_account INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  source TEXT,
  source_id INTEGER,
  source_account INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS splits_to ON splits(to_account);
CREATE INDEX IF NOT EXISTS splits_node ON splits(node_id);

CREATE TABLE IF NOT EXISTS treasury (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS badges (
  account_id INTEGER NOT NULL,
  metric INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, metric, tier)
);

CREATE TABLE IF NOT EXISTS claims (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  to_addr TEXT NOT NULL,
  voucher_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS pending_content (
  content_hash TEXT PRIMARY KEY,
  full_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cursor (
  name TEXT PRIMARY KEY,
  block INTEGER NOT NULL
);
`;
