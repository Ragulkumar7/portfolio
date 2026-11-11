/* =====================================================================
   data.js — runtime data for the Ragul Kumar portfolio

   The image map is resolved relative to this script's own URL so every
   page (/, /work/, /services/) can share a single copy. Only screenshot
   files that actually exist in assets/img/ are listed — missing shots
   leave the SVG placeholders visible instead of showing broken images.
   ===================================================================== */
(function () {
  'use strict';

  var base = '';
  try {
    if (document.currentScript && document.currentScript.src) {
      base = document.currentScript.src;
    }
  } catch (e) { /* older engines — fall back to root-relative paths */ }

  function asset(path) {
    if (!base) return path;
    try { return new URL('../' + path, base).href; } catch (e) { return path; }
  }

  var IMG = 'assets/img/';
  var files = ['workack-desktop.webp', 'workack-mobile.webp', 'rupnidhi-desktop.webp', 'rupnidhi-mobile.webp', 'swarnalagna-desktop.webp', 'swarnalagna-mobile.webp', 'theworldofnerds-desktop.webp', 'theworldofnerds-mobile.webp', 'anichamboutique-desktop.webp', 'anichamboutique-mobile.webp'];

  var images = {};
  for (var i = 0; i < files.length; i++) {
    images[files[i].replace(/\.webp$/, '')] = asset(IMG + files[i]);
  }

  window.PORTFOLIO = {
    images: images
  };
})();
