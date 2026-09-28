import type { DB } from "./index";

export interface NodeRow {
  id: number;
  parent_id: number;
  root_id: number;
  author_id: number;
  kind: number;
  excerpt: string;
  content_hash: string;
  full_text: string | null;
  fee: number;
  tx_hash: string;
  log_index: number;
  block: number;
  created_at: number;
  likes: number;
  replies: number;
  reposts: number;
  author_name?: string | null;
}

export interface AccountRow {
  id: number;
  owner: string;
  name: string | null;
  tier: number;
  minted_tx: string | null;
  created_at: number;
}

export interface SplitRow {
  tx_hash: string;
  log_index: number;
  node_id: number;
  to_account: number;
  depth: number;
  amount: number;
  source: string | null;
  source_id: number | null;
  source_account: number | null;
  created_at: number;
  to_name?: string | null;
}

export function makeQueries(db: DB) {
  const q = {
    // ---------------------------------------------------------------- 写（索引器）
    upsertAccount: db.prepare(
      `INSERT INTO accounts (id, owner, minted_tx, created_at) VALUES (@id, @owner, @mintedTx, @createdAt)
       ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, minted_tx = COALESCE(accounts.minted_tx, excluded.minted_tx),
         created_at = CASE WHEN accounts.created_at = 0 THEN excluded.created_at ELSE accounts.created_at END`,
    ),
    setOwner: db.prepare(`UPDATE accounts SET owner = ? WHERE id = ?`),
    insertNode: db.prepare(
      `INSERT OR IGNORE INTO nodes (id, parent_id, root_id, author_id, kind, excerpt, content_hash, full_text, fee, tx_hash, log_index, block, created_at)
       VALUES (@id, @parentId, @rootId, @authorId, @kind, @excerpt, @contentHash, @fullText, @fee, @txHash, @logIndex, @block, @createdAt)`,
    ),
    bumpReplies: db.prepare(`UPDATE nodes SET replies = replies + 1 WHERE id = ?`),
    bumpReposts: db.prepare(`UPDATE nodes SET reposts = reposts + 1 WHERE id = ?`),
    bumpLikes: db.prepare(`UPDATE nodes SET likes = likes + 1 WHERE id = ?`),
    insertLike: db.prepare(
      `INSERT OR IGNORE INTO likes (node_id, by_account, fee, tx_hash, log_index, created_at) VALUES (@nodeId, @byAccount, @fee, @txHash, @logIndex, @createdAt)`,
    ),
    insertSplit: db.prepare(
      `INSERT OR IGNORE INTO splits (tx_hash, log_index, node_id, to_account, depth, amount, source, source_id, source_account, created_at)
       VALUES (@txHash, @logIndex, @nodeId, @toAccount, @depth, @amount, @source, @sourceId, @sourceAccount, @createdAt)`,
    ),
    insertTreasury: db.prepare(
      `INSERT OR IGNORE INTO treasury (tx_hash, log_index, node_id, amount, created_at) VALUES (@txHash, @logIndex, @nodeId, @amount, @createdAt)`,
    ),
    insertBadge: db.prepare(
      `INSERT OR IGNORE INTO badges (account_id, metric, tier, threshold, tx_hash, created_at) VALUES (@accountId, @metric, @tier, @threshold, @txHash, @createdAt)`,
    ),
    insertClaim: db.prepare(
      `INSERT OR IGNORE INTO claims (tx_hash, log_index, account_id, amount, to_addr, voucher_id, created_at) VALUES (@txHash, @logIndex, @accountId, @amount, @toAddr, @voucherId, @createdAt)`,
    ),
    getCursor: db.prepare(`SELECT block FROM cursor WHERE name = 'main'`),
    setCursor: db.prepare(`INSERT INTO cursor (name, block) VALUES ('main', ?) ON CONFLICT(name) DO UPDATE SET block = excluded.block`),

    // ---------------------------------------------------------------- 写（网关）
    putPendingContent: db.prepare(
      `INSERT OR IGNORE INTO pending_content (content_hash, full_text, created_at) VALUES (?, ?, ?)`,
    ),
    getPendingContent: db.prepare(`SELECT full_text FROM pending_content WHERE content_hash = ?`),
    setAccountName: db.prepare(
      `INSERT INTO accounts (id, owner, name, created_at) VALUES (@id, @owner, @name, 0)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
    ),

    // ---------------------------------------------------------------- 读
    node: db.prepare(
      `SELECT n.*, a.name AS author_name FROM nodes n LEFT JOIN accounts a ON a.id = n.author_id WHERE n.id = ?`,
    ),
    nodesByIds: (ids: number[]): NodeRow[] =>
      ids.length
        ? (db
            .prepare(
              `SELECT n.*, a.name AS author_name FROM nodes n LEFT JOIN accounts a ON a.id = n.author_id WHERE n.id IN (${ids.map(() => "?").join(",")})`,
            )
            .all(...ids) as NodeRow[])
        : [],
    feed: db.prepare(
      `SELECT n.*, a.name AS author_name FROM nodes n LEFT JOIN accounts a ON a.id = n.author_id
       WHERE n.kind IN (0, 2) AND n.id < ? ORDER BY n.id DESC LIMIT ?`,
    ),
    byAuthor: db.prepare(
      `SELECT n.*, a.name AS author_name FROM nodes n LEFT JOIN accounts a ON a.id = n.author_id
       WHERE n.author_id = ? AND n.id < ? ORDER BY n.id DESC LIMIT ?`,
    ),
    feedSince: db.prepare(
      `SELECT n.*, a.name AS author_name FROM nodes n LEFT JOIN accounts a ON a.id = n.author_id
       WHERE n.id > ? ORDER BY n.id ASC LIMIT ?`,
    ),
    children: db.prepare(
      `SELECT n.*, a.name AS author_name FROM nodes n LEFT JOIN accounts a ON a.id = n.author_id WHERE n.parent_id = ? ORDER BY n.id ASC`,
    ),
    descendants: db.prepare(
      `WITH RECURSIVE sub(id) AS (SELECT id FROM nodes WHERE parent_id = ? UNION ALL SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id)
       SELECT n.*, a.name AS author_name FROM nodes n JOIN sub ON sub.id = n.id LEFT JOIN accounts a ON a.id = n.author_id ORDER BY n.id ASC LIMIT 500`,
    ),
    splitsForNodes: (ids: number[]): SplitRow[] =>
      ids.length
        ? (db
            .prepare(
              `SELECT s.*, a.name AS to_name FROM splits s LEFT JOIN accounts a ON a.id = s.to_account
               WHERE s.node_id IN (${ids.map(() => "?").join(",")}) ORDER BY s.created_at ASC, s.tx_hash ASC, s.log_index ASC`,
            )
            .all(...ids) as SplitRow[])
        : [],
    /** 根帖：整棵树流给作者的钱；非根：直接打在它身上的互动分给作者的钱 */
    nodeEarned: db.prepare(
      `SELECT COALESCE(SUM(s.amount), 0) AS v FROM splits s JOIN nodes n ON n.id = s.node_id
       WHERE s.to_account = @author AND ((@isRoot = 1 AND n.root_id = @id) OR (@isRoot = 0 AND s.node_id = @id AND s.depth = 0))`,
    ),
    account: db.prepare(`SELECT * FROM accounts WHERE id = ?`),
    accountsByOwner: db.prepare(`SELECT * FROM accounts WHERE lower(owner) = lower(?) ORDER BY id ASC`),
    accountBadges: db.prepare(`SELECT metric, tier, threshold, tx_hash, created_at FROM badges WHERE account_id = ? ORDER BY created_at ASC`),
    accountSpent: db.prepare(
      `SELECT (SELECT COALESCE(SUM(fee), 0) FROM nodes WHERE author_id = @id) + (SELECT COALESCE(SUM(fee), 0) FROM likes WHERE by_account = @id) AS v`,
    ),
    accountEarned: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS v FROM splits WHERE to_account = ?`),
    accountReceived: db.prepare(
      `SELECT COALESCE(SUM(likes + replies + reposts), 0) AS v FROM nodes WHERE author_id = ?`,
    ),
    leaderboardSpent: db.prepare(
      `SELECT a.id AS account_id, a.name, (
          (SELECT COALESCE(SUM(fee), 0) FROM nodes WHERE author_id = a.id) + (SELECT COALESCE(SUM(fee), 0) FROM likes WHERE by_account = a.id) + @mintFee
        ) AS value FROM accounts a ORDER BY value DESC, a.id ASC LIMIT @limit`,
    ),
    leaderboardReceived: db.prepare(
      `SELECT a.id AS account_id, a.name, (SELECT COALESCE(SUM(likes + replies + reposts), 0) FROM nodes WHERE author_id = a.id) AS value
       FROM accounts a ORDER BY value DESC, a.id ASC LIMIT @limit`,
    ),
    leaderboardEarned: db.prepare(
      `SELECT a.id AS account_id, a.name, (SELECT COALESCE(SUM(amount), 0) FROM splits WHERE to_account = a.id) AS value
       FROM accounts a ORDER BY value DESC, a.id ASC LIMIT @limit`,
    ),
    flows: db.prepare(
      `SELECT s.*, a.name AS to_name FROM splits s LEFT JOIN accounts a ON a.id = s.to_account ORDER BY s.rowid DESC LIMIT ?`,
    ),
    stats: db.prepare(
      `SELECT (SELECT COUNT(*) FROM accounts) AS accounts, (SELECT COUNT(*) FROM nodes) AS nodes, (SELECT COUNT(*) FROM likes) AS likes,
              (SELECT COALESCE(SUM(amount), 0) FROM splits) AS distributed, (SELECT COALESCE(SUM(amount), 0) FROM treasury) AS treasury`,
    ),
  };
  return q;
}

export type Queries = ReturnType<typeof makeQueries>;
