/** Probe URL parameter; the service worker lets requests carrying it go straight to the network. */
export const PROBE_PARAM = "_probe";

/**
 * Connection notice: a banner when the device is offline or the connection is slow.
 * Slow = a tiny same-origin request takes over SLOW_MS (1.5 s; or times out). The banner hides again
 * after two fast probes in a row, so it doesn't flicker on a borderline connection.
 */
export const NET_STATUS = (root: string) => `(function () {
  var bar = document.getElementById("net-banner");
  if (!bar) return;
  var SLOW_MS = 1500, TIMEOUT_MS = 10000, EVERY_MS = 15000, fast = 0, slow = false, timer = null, busy = false;
  var TEXT = {
    offline: "Du bist offline. Angezeigte Daten sind evtl. nicht aktuell.",
    slow: "Langsame Verbindung. Laden dauert evtl. länger."
  };
  function show(state) {
    if (!state) { bar.hidden = true; return; }
    bar.dataset.state = state;
    bar.textContent = TEXT[state];
    bar.hidden = false;
  }
  function render() { show(!navigator.onLine ? "offline" : slow ? "slow" : null); }
  function probe() {
    if (!navigator.onLine || document.hidden || busy) return render();
    busy = true;
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var abort = ctrl && setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var t0 = Date.now();
    fetch("${root}manifest.webmanifest?${PROBE_PARAM}=" + t0, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.arrayBuffer(); })
      .then(function () {
        if (Date.now() - t0 > SLOW_MS) { slow = true; fast = 0; }
        else if (++fast >= 2) slow = false;
      }, function () { slow = true; fast = 0; })
      .then(function () { clearTimeout(abort); busy = false; render(); });
  }
  function start() {
    clearInterval(timer);
    timer = setInterval(probe, EVERY_MS);
    probe();
  }
  window.addEventListener("offline", render);
  window.addEventListener("online", function () { fast = 0; render(); start(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) probe(); });
  render();
  start();
})();`;
