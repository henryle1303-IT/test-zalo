import { db, type Scheduled } from "./db.js";
import { sendText, state } from "./zalo.js";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60_000;
let running = false;

export async function tick() {
  if (running || state.login !== "logged_in") return;
  running = true;
  try {
    const due = db
      .prepare("SELECT * FROM scheduled WHERE status='pending' AND send_at <= ? ORDER BY send_at LIMIT 20")
      .all(Date.now()) as Scheduled[];
    for (const job of due) {
      // claim truoc khi gui de tranh gui trung
      const claimed = db.prepare("UPDATE scheduled SET status='sending', attempts=attempts+1 WHERE id=? AND status='pending'").run(job.id);
      if (!claimed.changes) continue;
      try {
        await sendText(job.thread_id, job.thread_type, job.text);
        db.prepare("UPDATE scheduled SET status='sent', error=NULL WHERE id=?").run(job.id);
      } catch (e) {
        const msg = (e as Error).message;
        if (job.attempts + 1 >= MAX_ATTEMPTS) {
          db.prepare("UPDATE scheduled SET status='failed', error=? WHERE id=?").run(msg, job.id);
        } else {
          db.prepare("UPDATE scheduled SET status='pending', error=?, send_at=? WHERE id=?").run(msg, Date.now() + RETRY_DELAY_MS, job.id);
        }
      }
    }
  } finally {
    running = false;
  }
}

export function startScheduler() {
  // job dang 'sending' do crash lan truoc: danh dau failed de khong gui lap
  db.prepare("UPDATE scheduled SET status='failed', error='Server dung giua luc gui' WHERE status='sending'").run();
  setInterval(() => void tick(), 5_000);
}
