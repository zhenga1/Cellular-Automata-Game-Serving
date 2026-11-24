/* Light / dark mode for every page of the site (home, sim.html, play.html,
 * play-v2.html, race.html). Load it in <head>, not async, so the mode is set
 * before the page first paints. Light is the default; the choice is remembered
 * per browser and follows across open tabs (and race.html's two game frames).
 *
 * Pages style themselves with   :root[data-mode="light"] { --bg: ...; }
 *                         and   :root[data-mode="dark"]  { ... }
 */
(function () {
  "use strict";
  var KEY = "ca-mode";
  var root = document.documentElement;
  var mode = "light";
  try { if (localStorage.getItem(KEY) === "dark") mode = "dark"; } catch (e) {}
  root.dataset.mode = mode;

  // The 3D view's sky (the engine's clear colour), RGB 0..1
  var SKY = { light: [0.83, 0.88, 0.93], dark: [0.25, 0.25, 0.25] };

  var SUN = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></g></svg>';
  var MOON = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.5 10.2A5.8 5.8 0 0 1 5.8 2.5a5.8 5.8 0 1 0 7.7 7.7Z" fill="currentColor"/></svg>';

  var buttons = [], listeners = [];

  function refresh() {
    buttons.forEach(function (b) {
      var toDark = mode === "light";
      b.innerHTML = toDark ? MOON : SUN;
      b.title = toDark ? "Dark mode" : "Light mode";
      b.setAttribute("aria-label", toDark ? "Switch to dark mode" : "Switch to light mode");
    });
  }

  var ColorMode = {
    get mode() { return mode; },
    sky: function () { return SKY[mode].slice(); },
    set: function (m) {
      mode = m === "dark" ? "dark" : "light";
      root.dataset.mode = mode;
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      refresh();
      listeners.forEach(function (fn) { try { fn(mode); } catch (e) { console.error(e); } });
    },
    toggle: function () { ColorMode.set(mode === "light" ? "dark" : "light"); },
    onChange: function (fn) { listeners.push(fn); },
    // A sun / moon button that toggles the mode, appended to `container`
    mount: function (container, className) {
      if (!container) return null;
      var b = document.createElement("button");
      b.type = "button";
      b.className = className || "icon-btn mode-btn";
      b.addEventListener("click", function () { ColorMode.toggle(); b.blur(); });
      container.appendChild(b);
      buttons.push(b);
      refresh();
      return b;
    },
    // Keeps the 3D view's sky in step with the mode. Call once the engine runs
    // (onRuntimeInitialized), with the Emscripten Module.
    attachEngine: function (Module) {
      function paint() {
        try { Module.ccall("ca_set_background", null, ["number", "number", "number"], SKY[mode]); } catch (e) {}
      }
      paint();
      listeners.push(paint);
    },
  };

  // Another tab (or race.html around its game frames) changed the mode
  window.addEventListener("storage", function (e) {
    if (e.key === KEY && e.newValue && e.newValue !== mode) ColorMode.set(e.newValue);
  });

  window.ColorMode = ColorMode;
})();
