// Stash worker: watches vaults on every configured network, sends Telegram alerts to owners and
// guardians, and runs due auto-saves. Run from app/:  npm run worker
import { NETWORKS, type NetworkKey } from "../src/lib/config.ts";
import { keeperAddress, runDue } from "./keeper.ts";
import { load, save } from "./store.ts";
import { pollOnce, send, telegramEnabled } from "./telegram.ts";
import { client, deployBlock, scan, stakeholders, type Alert } from "./watch.ts";

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SCAN_EVERY_MS = 10_000;
const KEEPER_EVERY_MS = 60_000;

const state = load();
// Testnet and mainnet share one app (a switch in the header), so watch every network with a factory.
const networks = (Object.keys(NETWORKS) as NetworkKey[]).filter((k) => NETWORKS[k].factory);
const modeOf = (key: NetworkKey) => (NETWORKS[key].chain.testnet ? "testnet" : "mainnet");

for (const key of networks) {
  if (!state.networks[key]) {
    // First run: index everything since deployment, but only alert on events from now on.
    const head = await client(key).getBlockNumber();
    state.networks[key] = { lastBlock: (deployBlock(key) - 1n).toString(), vaults: [], autoSaves: [], quietUntil: head.toString() };
  }
}
save(state);

async function deliver(alerts: Alert[]) {
  for (const alert of alerts) {
    console.log(`[${alert.network}] ${alert.html.replace(/<[^>]+>/g, "").split("\n")[0]}`);
    if (!telegramEnabled()) continue;
    const people = await stakeholders(alert.network, alert.vault);
    const owner = people[0];
    for (const person of people) {
      for (const chatId of state.chats[person] ?? []) {
        const link =
          person === owner
            ? { text: "Open Stash", url: APP_URL }
            : { text: "Open guardian page", url: `${APP_URL}/guardian?vault=${alert.vault}&network=${modeOf(alert.network)}` };
        try {
          await send(chatId, alert.html, link);
        } catch (e) {
          console.warn("telegram send failed:", (e as Error).message);
        }
      }
    }
  }
}

async function scanLoop() {
  for (;;) {
    for (const key of networks) {
      try {
        const alerts = await scan(key, state.networks[key]);
        save(state);
        await deliver(alerts);
      } catch (e) {
        console.warn(`[${key}] scan failed:`, (e as Error).message.split("\n")[0]);
      }
    }
    await new Promise((r) => setTimeout(r, SCAN_EVERY_MS));
  }
}

async function keeperLoop() {
  for (;;) {
    for (const key of networks) {
      try {
        await deliver(await runDue(key, state.networks[key], state.notified));
        save(state);
      } catch (e) {
        console.warn(`[${key}] keeper failed:`, (e as Error).message.split("\n")[0]);
      }
    }
    await new Promise((r) => setTimeout(r, KEEPER_EVERY_MS));
  }
}

async function telegramLoop() {
  for (;;) {
    try {
      await pollOnce(state);
    } catch (e) {
      console.warn("telegram poll failed:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

console.log(`Stash worker: networks ${networks.join(", ")} · telegram ${telegramEnabled() ? "on" : "off"} · keeper ${keeperAddress() ?? "off"}`);
scanLoop();
keeperLoop();
if (telegramEnabled()) telegramLoop();
