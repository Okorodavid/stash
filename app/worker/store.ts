// Tiny JSON-file state for the worker: scan checkpoints, known vaults, auto-save plans,
// and which Telegram chats follow which wallet addresses.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type NetworkState = {
  lastBlock: string; // bigint as string
  vaults: string[]; // lowercase addresses
  autoSaves: { vault: string; source: string }[];
  /** First-run history up to this block is indexed silently (no alerts for old events). */
  quietUntil: string;
};

export type State = {
  networks: Record<string, NetworkState>;
  /** lowercase wallet address -> Telegram chat ids following it */
  chats: Record<string, number[]>;
  telegramOffset: number;
  /** de-dupe keys for one-off notices (e.g. a failed auto-save for a given due time) */
  notified: string[];
};

const FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "state.json");

export function load(): State {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as State;
  } catch {
    return { networks: {}, chats: {}, telegramOffset: 0, notified: [] };
  }
}

export function save(state: State) {
  mkdirSync(dirname(FILE), { recursive: true });
  state.notified = state.notified.slice(-500);
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, FILE); // atomic replace, so a crash never leaves half a file
}

export function follow(state: State, address: string, chatId: number) {
  const key = address.toLowerCase();
  const list = state.chats[key] ?? [];
  if (!list.includes(chatId)) state.chats[key] = [...list, chatId];
}

export function unfollowAll(state: State, chatId: number) {
  for (const key of Object.keys(state.chats)) {
    state.chats[key] = state.chats[key].filter((c) => c !== chatId);
    if (state.chats[key].length === 0) delete state.chats[key];
  }
}
