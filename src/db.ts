import Database from "better-sqlite3";
import fs from "node:fs";

fs.mkdirSync("data", { recursive: true });
export const db = new Database("data/app.db");

db.exec(`
CREATE TABLE IF NOT EXISTS scheduled (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  thread_type INTEGER NOT NULL,
  thread_name TEXT,
  text TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  thread_type INTEGER NOT NULL,
  direction TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled(status, send_at);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_id, ts);
`);

export type Scheduled = {
  id: number;
  thread_id: string;
  thread_type: number;
  thread_name: string | null;
  text: string;
  send_at: number;
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  error: string | null;
  attempts: number;
};

export function logMessage(threadId: string, threadType: number, direction: "in" | "out", text: string, ts = Date.now()) {
  db.prepare("INSERT INTO messages(thread_id, thread_type, direction, text, ts) VALUES (?,?,?,?,?)")
    .run(threadId, threadType, direction, text, ts);
}
