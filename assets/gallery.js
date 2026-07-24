/*
 * Kotik gallery.
 *
 * Everything shown in the gallery comes from media.js (window.KOTIK_MEDIA),
 * loaded by a plain <script> tag just before this file. To add a photo or a
 * clip: drop the file in media/, add one object to media.js. No HTML editing,
 * no build step.
 *
 * A <script> tag rather than fetch('media.json') on purpose: browsers refuse
 * to fetch local files, so a JSON manifest would leave the gallery dead
 * whenever index.html is opened by double-clicking it. This works both from
 * disk and over http.
 *
 * Supported item types:
 *   {"type":"image",   "src":"media/x.webp", "thumb":"media/thumbs/x.webp", "alt":{...}}
 *   {"type":"video",   "src":"media/x.mp4",  "thumb":"...", "poster":"..." (optional), "alt":{...}}
 *   {"type":"youtube", "id":"VIDEO_ID",      "thumb":"...", "poster":"..." (optional), "alt":{...}}
 *
 * "alt" holds one string per language ("ru", "en", "ka") and is re-applied
 * when the visitor switches language.
 *
 * YouTube items render as a poster image with a play button. The real iframe
 * is only inserted after a click, so the ~1 MB player and its cookies cost
 * nothing to visitors who never press play.
 */
(function () {
    'use strict';

    var FALLBACK_LANG = 'ru';
    var SWIPE_MIN = 40;   // px of horizontal travel before it counts as a swipe

    var items = [];
    var index = 0;
    var lang = FALLBACK_LANG;

    var card, stage, thumbsEl, counterEl, prevBtn, nextBtn;
    var heroImg = null;   // the <img> already in the HTML; reused so it never flashes

    /* ---------------------------------------------------------------- utils */

    function altFor(item) {
        var a = item && item.alt;
        if (!a) return 'Котик';
        return a[lang] || a[FALLBACK_LANG] || a.en || 'Котик';
    }

    function posterFor(item) {
        return item.poster || item.thumb || '';
    }

    // Neighbour prefetch must never compete with the first photo or the fonts.
    var idle = window.requestIdleCallback
        ? function (fn) { window.requestIdleCallback(fn, { timeout: 3000 }); }
        : function (fn) { setTimeout(fn, 800); };

    /* --------------------------------------------------------------- stage */

    function imageNode(item) {
        // Reuse the server-rendered <img> so the first paint is never thrown away.
        var el = heroImg || document.createElement('img');
        el.id = 'img';
        el.decoding = 'async';
        if (el.getAttribute('src') !== item.src) el.src = item.src;
        el.alt = altFor(item);
        return el;
    }

    function videoNode(item) {
        var el = document.createElement('video');
        el.src = item.src;
        el.controls = true;
        el.preload = 'metadata';
        el.playsInline = true;
        var poster = posterFor(item);
        if (poster) el.poster = poster;
        el.setAttribute('aria-label', altFor(item));
        return el;
    }

    function youtubeNode(item) {
        var label = altFor(item);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'yt-facade';
        btn.setAttribute('aria-label', label);
        var poster = posterFor(item);
        if (poster) btn.style.backgroundImage = 'url("' + poster + '")';

        var play = document.createElement('span');
        play.className = 'yt-play';
        play.setAttribute('aria-hidden', 'true');
        btn.appendChild(play);

        btn.addEventListener('click', function () {
            var frame = document.createElement('iframe');
            // -nocookie + no autoplay-on-load: nothing is requested until this click.
            frame.src = 'https://www.youtube-nocookie.com/embed/' +
                encodeURIComponent(item.id) + '?autoplay=1&rel=0';
            frame.title = label;
            frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
            frame.allowFullscreen = true;
            frame.setAttribute('frameborder', '0');
            if (btn.parentNode) btn.parentNode.replaceChild(frame, btn);
        });

        return btn;
    }

    function build(item) {
        if (item.type === 'video') return videoNode(item);
        if (item.type === 'youtube') return youtubeNode(item);
        return imageNode(item);
    }

    function show(i) {
        if (!items.length) return;
        index = (i % items.length + items.length) % items.length;   // wraps both ways
        var item = items[index];

        // Detach the hero <img> before emptying, otherwise it is destroyed and
        // the next image item would have to decode from scratch.
        if (heroImg && heroImg.parentNode === stage) stage.removeChild(heroImg);
        stage.textContent = '';
        stage.appendChild(build(item));

        if (thumbsEl) {
            var btns = thumbsEl.children;
            for (var n = 0; n < btns.length; n++) {
                var on = n === index;
                btns[n].classList.toggle('active', on);
                if (on) btns[n].setAttribute('aria-current', 'true');
                else btns[n].removeAttribute('aria-current');
            }
        }

        if (counterEl) counterEl.textContent = (index + 1) + ' / ' + items.length;

        prefetch(index + 1);
        prefetch(index - 1);
    }

    function prefetch(i) {
        if (items.length < 2) return;
        var item = items[(i % items.length + items.length) % items.length];
        if (item.type !== 'image' || !item.src) return;
        idle(function () { new Image().src = item.src; });
    }

    /* --------------------------------------------------------------- thumbs */

    function buildThumbs() {
        thumbsEl.textContent = '';
        items.forEach(function (item, i) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'thumb-item';

            var im = document.createElement('img');
            im.src = item.thumb || posterFor(item);
            im.alt = '';
            im.loading = 'lazy';
            im.decoding = 'async';
            btn.appendChild(im);

            if (item.type === 'video' || item.type === 'youtube') {
                var badge = document.createElement('span');
                badge.className = 'thumb-badge';
                badge.innerHTML = '<i class="fa-solid fa-play"></i>';
                btn.appendChild(badge);
            }

            btn.setAttribute('aria-label', altFor(item));
            btn.addEventListener('click', function () { show(i); });
            thumbsEl.appendChild(btn);
        });
    }

    /* Re-label everything for the current language, without rebuilding the
       stage -- a full re-render would restart a video that is playing. */
    function applyLang() {
        if (!items.length) return;

        var el = stage.firstElementChild;
        if (el) {
            if (el.tagName === 'IMG') el.alt = altFor(items[index]);
            else if (el.tagName !== 'IFRAME') el.setAttribute('aria-label', altFor(items[index]));
        }

        if (thumbsEl) {
            var btns = thumbsEl.children;
            for (var n = 0; n < btns.length && n < items.length; n++) {
                btns[n].setAttribute('aria-label', altFor(items[n]));
            }
        }
    }

    /* ------------------------------------------------------------ behaviour */

    function wire() {
        if (prevBtn) prevBtn.addEventListener('click', function () { show(index - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function () { show(index + 1); });

        // Arrow keys, but only while the gallery has focus -- a document-level
        // handler would steal the arrow keys used to scroll the page.
        card.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft') { show(index - 1); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { show(index + 1); e.preventDefault(); }
        });

        // Swipe. Only on image items, so it never fights with video controls.
        var x0 = null, y0 = null;
        stage.addEventListener('pointerdown', function (e) {
            if (items[index] && items[index].type !== 'image') { x0 = null; return; }
            x0 = e.clientX; y0 = e.clientY;
        });
        stage.addEventListener('pointerup', function (e) {
            if (x0 === null) return;
            var dx = e.clientX - x0, dy = e.clientY - y0;
            x0 = null;
            // Ignore mostly-vertical drags so page scrolling still works.
            if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
            show(dx < 0 ? index + 1 : index - 1);
        });
        stage.addEventListener('pointercancel', function () { x0 = null; });
    }

    /* -------------------------------------------------------------- degrade */

    function degrade(why) {
        // media.js missing or broken. Keep the photo that is already on screen
        // and hide the controls that would now do nothing -- dead arrows are
        // worse than no arrows. Note [hidden]{display:none!important} in the
        // CSS: without it these author display:flex/grid rules win and the
        // buttons stay visible but inert.
        if (console && console.warn) console.warn('[gallery] ' + why + ' — showing the single static photo.');
        [thumbsEl, counterEl, document.querySelector('.gallery-nav')].forEach(function (el) {
            if (el) el.hidden = true;
        });

        if (!thumbsEl || !thumbsEl.parentNode) return;

        var tip = document.createElement('p');
        tip.className = 'gallery-tip';
        tip.appendChild(document.createTextNode(
            'Галерея не загрузилась: не удалось прочитать '));
        var f = document.createElement('code');
        f.textContent = 'media.js';
        tip.appendChild(f);
        tip.appendChild(document.createTextNode(
            '. Скорее всего, в нём опечатка — пропущена запятая или кавычка. ' +
            'Точное место покажет консоль браузера (F12), а также команда '));
        var cmd = document.createElement('code');
        cmd.textContent = 'python tools/check_site.py';
        tip.appendChild(cmd);
        tip.appendChild(document.createTextNode('.'));
        thumbsEl.parentNode.appendChild(tip);
    }

    /* ----------------------------------------------------------------- init */

    function init() {
        card = document.querySelector('.gallery-card');
        stage = document.getElementById('gallery-stage');
        if (!card || !stage) return;

        thumbsEl = document.getElementById('gallery-thumbs');
        counterEl = document.getElementById('gallery-counter');
        prevBtn = document.getElementById('gallery-prev');
        nextBtn = document.getElementById('gallery-next');
        heroImg = document.getElementById('img');
        lang = document.documentElement.lang || FALLBACK_LANG;

        var data = window.KOTIK_MEDIA;
        if (!Array.isArray(data) || !data.length) {
            degrade('media.js did not define a non-empty window.KOTIK_MEDIA');
            return;
        }
        items = data;

        buildThumbs();
        wire();

        if (items.length < 2) {
            var nav = document.querySelector('.gallery-nav');
            if (nav) nav.hidden = true;
            if (counterEl) counterEl.hidden = true;
        }

        // The hero <img> already shows item 0, so this is a no-op repaint.
        show(0);
    }

    /* Called by setLanguage() in index.html. */
    window.KotikGallery = {
        setLang: function (next) {
            lang = next || FALLBACK_LANG;
            applyLang();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
