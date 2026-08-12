/*
 * QR codes for donation links.
 *
 * Two sources, in priority order:
 *   1. an image the curator uploaded (a QR the bank generated) — always wins,
 *      because a bank's own code may encode more than a bare URL;
 *   2. otherwise one generated here from the donation URL.
 *
 * Generated in the browser rather than saved as a file so the code can never
 * drift out of step with the link it points at. Change the URL and the QR
 * changes with it.
 *
 * The generator (assets/vendor/qrcode.js, ~57 KB) is fetched lazily, only on
 * pages that actually need to draw one, and only once per page.
 */
(function () {
  'use strict';

  var VENDOR = 'assets/vendor/qrcode.js';

  /* Error correction level. 'M' (~15% recoverable) is the usual choice for a
     screen-displayed code: 'L' is fragile against camera glare, 'H' inflates
     the module count and makes the code harder to scan at small sizes. */
  var ERROR_CORRECTION = 'M';

  var loading = null;

  /* Resolve the vendor path relative to this script, so pages in a
     subdirectory (or served from /pet/<slug> on Vercel) still find it. */
  function vendorUrl() {
    var here = document.currentScript && document.currentScript.src;
    if (!here) {
      var tags = document.getElementsByTagName('script');
      for (var i = 0; i < tags.length; i++) {
        if (tags[i].src && tags[i].src.indexOf('assets/qr.js') !== -1) { here = tags[i].src; break; }
      }
    }
    if (!here) return VENDOR;
    return here.replace(/assets\/qr\.js.*$/, VENDOR);
  }

  var resolved = vendorUrl();

  function load() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (loading) return loading;

    loading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = resolved;
      script.async = true;
      script.onload = function () {
        if (window.qrcode) resolve(window.qrcode);
        else reject(new Error('qrcode.js loaded but did not define window.qrcode'));
      };
      script.onerror = function () { reject(new Error('could not load ' + resolved)); };
      document.head.appendChild(script);
    });
    return loading;
  }

  /*
   * Draw a QR for `text` into `container`.
   *
   * Returns a promise so callers can fall back to a plain link if generation
   * fails — a missing QR should never take the donate button down with it.
   */
  function render(container, text, options) {
    if (!container) return Promise.resolve(null);
    if (!text) { container.textContent = ''; return Promise.resolve(null); }

    var opts = options || {};

    return load().then(function (qrcode) {
      /* Type 0 = pick the smallest version that fits the data. */
      var qr = qrcode(0, opts.errorCorrection || ERROR_CORRECTION);
      qr.addData(text);
      qr.make();

      /* An SVG stays sharp at any size and prints cleanly, which matters when
         someone photographs the screen or puts a flyer up. */
      container.innerHTML = qr.createSvgTag({
        cellSize: opts.cellSize || 4,
        margin: opts.margin !== undefined ? opts.margin : 8,
        scalable: true
      });

      var svg = container.firstElementChild;
      if (svg) {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', opts.label || text);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = '100%';
        svg.style.height = 'auto';
      }
      return svg;
    }).catch(function (err) {
      console.warn('[qr] ' + err.message);
      container.textContent = '';
      return null;
    });
  }

  /* Standalone SVG markup, for the admin's "download" button. */
  function svgMarkup(text, options) {
    var opts = options || {};
    return load().then(function (qrcode) {
      var qr = qrcode(0, opts.errorCorrection || ERROR_CORRECTION);
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({
        cellSize: opts.cellSize || 8,
        margin: opts.margin !== undefined ? opts.margin : 8,
        scalable: false
      });
    });
  }

  window.PetQR = {
    render: render,
    svgMarkup: svgMarkup,
    preload: load
  };
})();
