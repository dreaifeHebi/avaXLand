import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA } from "./schema";

export type DB = Database.Database;

/**
 * 打开（或新建）数据库。deploymentKey = "<chainId>:<posts 地址>"：
 * 数据库是某一份部署的链上抄本，换了链或换了合约地址就必须换文件，否则游标和数据会混在一起。
 */
export function openDb(path: string, deploymentKey: string): DB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'deployment'").get() as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('deployment', ?)").run(deploymentKey);
  } else if (row.value !== deploymentKey) {
    db.close();
    throw new Error(`数据库 ${path} 属于另一份部署（${row.value}），当前部署是 ${deploymentKey}。换一个 DB_PATH，或删掉这个文件让它重新回放。`);
  }
  return db;
}
