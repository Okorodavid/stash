// Minimal Telegram Bot API client: long-poll for /start <code> and /stop, send alerts.
import { verifyLinkCode } from "../src/lib/linkCode.ts";
import { follow, save, unfollowAll, type State } from "./store.ts";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const LINK_SECRET = process.env.LINK_SECRET ?? "";
const API = `https://api.telegram.org/bot${TOKEN}`;

export const telegramEnabled = () => Boolean(TOKEN && LINK_SECRET);

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call(method: string, body: unknown) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

/** Sends an HTML message; adds a button when the link is https (Telegram rejects localhost buttons). */
export async function send(chatId: number, html: string, link?: { text: string; url: string }) {
  const button = link && link.url.startsWith("https://");
  const text = link && !button ? `${html}\n\n${escapeHtml(link.text)}: ${link.url}` : html;
  await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: button ? { inline_keyboard: [[{ text: link.text, url: link.url }]] } : undefined,
  });
}

type Update = { update_id: number; message?: { chat: { id: number }; text?: string } };

/** One long-poll round: handles /start <code> (link) and /stop (unlink). */
export async function pollOnce(state: State) {
  const updates = (await call("getUpdates", { offset: state.telegramOffset, timeout: 25 })) as Update[];
  for (const u of updates) {
    state.telegramOffset = u.update_id + 1;
    const chatId = u.message?.chat.id;
    const text = u.message?.text?.trim() ?? "";
    if (!chatId) continue;
    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] ?? "";
      const address = code ? verifyLinkCode(LINK_SECRET, code) : null;
      if (address) {
        follow(state, address, chatId);
        await send(
          chatId,
          `✅ Alerts on for <code>${address}</code>.\n\nYou'll hear about large withdrawals, guardian changes, limit changes and freezes on any Stash vault this wallet owns or guards.\n\nSend /stop to turn alerts off.`,
        );
      } else {
        await send(chatId, "This link has expired or isn't valid. Open Stash and tap <b>Get Telegram alerts</b> again.");
      }
    } else if (text === "/stop") {
      unfollowAll(state, chatId);
      await send(chatId, "Alerts off. You can turn them back on from the Stash app any time.");
    }
    save(state);
  }
}
