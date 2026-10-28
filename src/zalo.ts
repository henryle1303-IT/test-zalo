import { Zalo, ThreadType, type API } from "zca-js";
import { LoginQRCallbackEventType } from "zca-js";
import fs from "node:fs";
import { logMessage } from "./db.js";

const SESSION_FILE = "data/session.json";

export type LoginState = "logged_out" | "waiting_qr" | "scanned" | "logged_in";

export const state = {
  login: "logged_out" as LoginState,
  qrImage: null as string | null,
  user: null as { name: string; avatar: string } | null,
  error: null as string | null,
};

let api: API | null = null;
const zalo = new Zalo();

export function getApi(): API {
  if (!api) throw new Error("Chua dang nhap Zalo");
  return api;
}

async function onLoggedIn(a: API) {
  api = a;
  state.login = "logged_in";
  state.qrImage = null;
  state.error = null;
  try {
    const info = await a.fetchAccountInfo();
    const p = (info as any).profile ?? info;
    state.user = { name: p.displayName ?? p.zaloName ?? "", avatar: p.avatar ?? "" };
  } catch {
    state.user = null;
  }
  a.listener.on("message", (m) => {
    if (m.isSelf) return;
    const content = m.data.content;
    const text = typeof content === "string" ? content : "[tep dinh kem]";
    logMessage(m.threadId, m.type, "in", text, Number(m.data.ts) || Date.now());
  });
  a.listener.on("closed", () => {
    state.login = "logged_out";
    state.error = "Mat ket noi Zalo (co the dang nhap noi khac). Hay dang nhap lai.";
    api = null;
  });
  a.listener.start({ retryOnClose: true });
}

export async function tryRestoreSession(): Promise<boolean> {
  if (!fs.existsSync(SESSION_FILE)) return false;
  try {
    const creds = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    await onLoggedIn(await zalo.login(creds));
    return true;
  } catch (e) {
    state.error = "Phien cu het han: " + (e as Error).message;
    return false;
  }
}

export function startQrLogin() {
  if (state.login === "waiting_qr" || state.login === "scanned") return;
  state.login = "waiting_qr";
  state.error = null;
  zalo
    .loginQR({}, (ev) => {
      switch (ev.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          state.qrImage = ev.data.image;
          break;
        case LoginQRCallbackEventType.QRCodeExpired:
          ev.actions.retry();
          break;
        case LoginQRCallbackEventType.QRCodeScanned:
          state.login = "scanned";
          state.qrImage = null;
          break;
        case LoginQRCallbackEventType.QRCodeDeclined:
          state.login = "logged_out";
          state.error = "Ban da tu choi dang nhap tren dien thoai";
          break;
        case LoginQRCallbackEventType.GotLoginInfo:
          fs.writeFileSync(SESSION_FILE, JSON.stringify(ev.data), { mode: 0o600 });
          break;
      }
    })
    .then(onLoggedIn)
    .catch((e) => {
      state.login = "logged_out";
      state.error = (e as Error).message;
    });
}

export async function logout() {
  try { api?.listener.stop(); } catch {}
  api = null;
  state.login = "logged_out";
  state.user = null;
  fs.rmSync(SESSION_FILE, { force: true });
}

export async function sendText(threadId: string, threadType: number, text: string) {
  const a = getApi();
  await a.sendMessage({ msg: text }, threadId, threadType as ThreadType);
  logMessage(threadId, threadType, "out", text);
}

export async function listContacts() {
  const a = getApi();
  const friends = await a.getAllFriends();
  return friends.map((f) => ({ id: f.userId, name: f.displayName || f.zaloName, avatar: f.avatar, type: ThreadType.User }));
}
