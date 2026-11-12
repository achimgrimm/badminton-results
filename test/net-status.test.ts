import { test } from "node:test";
import assert from "node:assert/strict";
import { NET_STATUS, PROBE_PARAM } from "../src/render/net-status.ts";
import { renderServiceWorker } from "../src/render/pwa.ts";

function run(online: boolean) {
  const bar: any = { hidden: true, dataset: {}, textContent: "" };
  const listeners: Record<string, () => void> = {};
  const win: any = { addEventListener: (n: string, f: () => void) => (listeners[n] = f) };
  const nav: any = { onLine: online };
  const doc: any = { getElementById: () => bar, hidden: true, addEventListener() {} };
  const timers: any[] = [];
  new Function("window", "document", "navigator", "setInterval", "clearInterval", NET_STATUS("./"))(
    win, doc, nav, (f: any) => timers.push(f), () => {});
  return { bar, listeners, nav };
}

test("net banner shows offline state and hides when back online", () => {
  const { bar, listeners, nav } = run(false);
  assert.equal(bar.hidden, false);
  assert.equal(bar.dataset.state, "offline");
  nav.onLine = true;
  listeners.online();
  assert.equal(bar.hidden, true);
});

test("net banner stays hidden when online", () => {
  assert.equal(run(true).bar.hidden, true);
});

test("service worker lets probe requests bypass the cache", () => {
  assert.ok(renderServiceWorker("x", "s.css").includes(PROBE_PARAM));
});
