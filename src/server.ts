import express from "express";
import { db } from "./db.js";
import { state, startQrLogin, tryRestoreSession, logout, listContacts, sendText } from "./zalo.js";
import { startScheduler } from "./scheduler.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/api/status", (_req, res) => res.json(state));
app.post("/api/login", (_req, res) => { startQrLogin(); res.json({ ok: true }); });
app.post("/api/logout", async (_req, res) => { await logout(); res.json({ ok: true }); });

app.get("/api/contacts", async (_req, res) => {
  try { res.json(await listContacts()); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

app.post("/api/send", async (req, res) => {
  const { threadId, threadType = 0, text } = req.body ?? {};
  if (!threadId || !text) return res.status(400).json({ error: "Thieu threadId/text" });
  try { await sendText(String(threadId), Number(threadType), String(text)); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

app.get("/api/schedule", (_req, res) => {
  res.json(db.prepare("SELECT * FROM scheduled ORDER BY send_at DESC LIMIT 200").all());
});

app.post("/api/schedule", (req, res) => {
  const { threadId, threadType = 0, threadName = null, text, sendAt } = req.body ?? {};
  const when = Number(sendAt);
  if (!threadId || !text || !Number.isFinite(when)) return res.status(400).json({ error: "Thieu threadId/text/sendAt" });
  if (when < Date.now() - 1000) return res.status(400).json({ error: "Thoi gian da qua" });
  const r = db
    .prepare("INSERT INTO scheduled(thread_id, thread_type, thread_name, text, send_at) VALUES (?,?,?,?,?)")
    .run(String(threadId), Number(threadType), threadName, String(text), when);
  res.json({ id: r.lastInsertRowid });
});

app.delete("/api/schedule/:id", (req, res) => {
  const r = db.prepare("UPDATE scheduled SET status='canceled' WHERE id=? AND status='pending'").run(req.params.id);
  res.json({ canceled: r.changes > 0 });
});

app.get("/api/messages/:threadId", (req, res) => {
  res.json(db.prepare("SELECT * FROM messages WHERE thread_id=? ORDER BY ts DESC LIMIT 100").all(req.params.threadId));
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "127.0.0.1", async () => {
  console.log(`http://localhost:${port}`);
  await tryRestoreSession();
  startScheduler();
});
