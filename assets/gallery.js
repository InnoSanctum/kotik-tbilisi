/*
 * Photo / video gallery.
 *
 * Originally hardwired to one cat and one global manifest; now mounted per pet:
 *
 *   PetGallery.mount(rootElement, items, lang)
 *
 * `items` is the pet's gallery array (see data/pets.js). Each entry is one of:
 *   {"type":"image",   "src":"…", "thumb":"…", "alt":{…}}
 *   {"type":"video",   "src":"…", "thumb":"…", "poster":"…" (optional), "alt":{…}}
 *   {"type":"youtube", "id":"…",  "thumb":"…", "poster":"…" (optional), "alt":{…}}
 *
 * "alt" holds one string per language and is re-applied on a language switch
 * without rebuilding the stage, so a playing video is never restarted.
 *
 * YouTube renders as a poster plus a play button; the real iframe (~1 MB of
 * script, plus cookies) is inserted only after a click, so visitors who never
 * press play pay nothing for it.
 */
(function () {
  'use strict';

  var SWIPE_MIN = 40;   // px of horizontal travel before it counts as a swipe

  function idle(fn) {
    /* Neighbour prefetch must never compete with the first photo or the fonts. */
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 3000 });
    else setTimeout(fn, 800);
  }

  function Gallery(root, items, lang) {
    this.root = root;
    this.items = (items || []).filter(function (it) {
      return it && (it.src || it.id);
    });
    this.lang = lang || (window.I18N ? window.I18N.getLang() : 'ru');
    this.index = 0;
    this.build();
  }

  Gallery.prototype.altFor = function (item) {
    if (!item) return '';
    return window.I18N ? window.I18N.pick(item.alt, this.lang) : (item.alt && item.alt.ru) || '';
  };

  Gallery.prototype.posterFor = function (item) {
    return item.poster || item.thumb || '';
  };

  /* ------------------------------------------------------------ scaffold */

  Gallery.prototype.build = function () {
    var t = window.I18N ? window.I18N.t : function (k) { return k; };
    this.root.textContent = '';
    this.root.className = 'gallery-card';
    this.root.tabIndex = 0;

    if (!this.items.length) {
      this.root.hidden = true;
      return;
    }

    var stage = document.createElement('div');
    stage.className = 'img-wrapper';

    var nav = document.createElement('div');
    nav.className = 'gallery-nav';

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'nav-btn';
    prev.setAttribute('aria-label', t('galleryPrev'));
    prev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'nav-btn';
    next.setAttribute('aria-label', t('galleryNext'));
    next.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';

    nav.appendChild(prev);
    nav.appendChild(next);

    var counter = document.createElement('div');
    counter.className = 'gallery-counter';
    counter.setAttribute('aria-live', 'polite');

    var thumbs = document.createElement('div');
    thumbs.className = 'thumbs';

    stage.appendChild(nav);
    stage.appendChild(counter);
    this.root.appendChild(stage);
    this.root.appendChild(thumbs);

    this.stage = stage;
    this.thumbs = thumbs;
    this.counter = counter;
    this.prevBtn = prev;
    this.nextBtn = next;

    /* A single photo needs no arrows, no counter, no filmstrip. */
    if (this.items.length < 2) {
      nav.hidden = true;
      counter.hidden = true;
      thumbs.hidden = true;
    }

    this.buildThumbs();
    this.wire();
    this.show(0);
  };

  Gallery.prototype.imageNode = function (item) {
    var el = document.createElement('img');
    el.src = item.src;
    el.alt = this.altFor(item);
    el.decoding = 'async';
    /* The first slide is the largest paint on the page; everything after it
       can wait until the visitor actually navigates there. */
    el.loading = this.index === 0 ? 'eager' : 'lazy';
    return el;
  };

  Gallery.prototype.videoNode = function (item) {
    var el = document.createElement('video');
    el.src = item.src;
    el.controls = true;
    el.preload = 'metadata';
    el.playsInline = true;
    var poster = this.posterFor(item);
    if (poster) el.poster = poster;
    el.setAttribute('aria-label', this.altFor(item));
    return el;
  };

  Gallery.prototype.youtubeNode = function (item) {
    var label = this.altFor(item);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yt-facade';
    btn.setAttribute('aria-label', label);
    var poster = this.posterFor(item);
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
  };

  Gallery.prototype.nodeFor = function (item) {
    if (item.type === 'video') return this.videoNode(item);
    if (item.type === 'youtube') return this.youtubeNode(item);
    return this.imageNode(item);
  };

  /* --------------------------------------------------------------- stage */

  Gallery.prototype.show = function (i) {
    if (!this.items.length) return;
    this.index = (i % this.items.length + this.items.length) % this.items.length;
    var item = this.items[this.index];

    /* Replace only the media node — the arrows and counter live in the same
       container and must survive. */
    var old = this.stage.querySelector('img, video, iframe, .yt-facade');
    var node = this.nodeFor(item);
    if (old) this.stage.replaceChild(node, old);
    else this.stage.insertBefore(node, this.stage.firstChild);

    var btns = this.thumbs.children;
    for (var n = 0; n < btns.length; n++) {
      var on = n === this.index;
      btns[n].classList.toggle('active', on);
      if (on) btns[n].setAttribute('aria-current', 'true');
      else btns[n].removeAttribute('aria-current');
    }

    this.counter.textContent = (this.index + 1) + ' / ' + this.items.length;

    this.prefetch(this.index + 1);
    this.prefetch(this.index - 1);
  };

  Gallery.prototype.prefetch = function (i) {
    if (this.items.length < 2) return;
    var item = this.items[(i % this.items.length + this.items.length) % this.items.length];
    if (!item || item.type !== 'image' || !item.src) return;
    idle(function () { new Image().src = item.src; });
  };

  /* -------------------------------------------------------------- thumbs */

  Gallery.prototype.buildThumbs = function () {
    var self = this;
    this.thumbs.textContent = '';
    this.items.forEach(function (item, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb-item';

      var im = document.createElement('img');
      im.src = item.thumb || self.posterFor(item) || item.src;
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

      btn.setAttribute('aria-label', self.altFor(item));
      btn.addEventListener('click', function () { self.show(i); });
      self.thumbs.appendChild(btn);
    });
  };

  /* Re-label for a new language without rebuilding the stage. */
  Gallery.prototype.setLang = function (lang) {
    this.lang = lang;
    if (!this.items.length) return;

    var el = this.stage.querySelector('img, video, .yt-facade');
    if (el) {
      if (el.tagName === 'IMG') el.alt = this.altFor(this.items[this.index]);
      else el.setAttribute('aria-label', this.altFor(this.items[this.index]));
    }

    var t = window.I18N ? window.I18N.t : function (k) { return k; };
    if (this.prevBtn) this.prevBtn.setAttribute('aria-label', t('galleryPrev'));
    if (this.nextBtn) this.nextBtn.setAttribute('aria-label', t('galleryNext'));

    var btns = this.thumbs.children;
    for (var n = 0; n < btns.length && n < this.items.length; n++) {
      btns[n].setAttribute('aria-label', this.altFor(this.items[n]));
    }
  };

  /* ----------------------------------------------------------- behaviour */

  Gallery.prototype.wire = function () {
    var self = this;

    this.prevBtn.addEventListener('click', function () { self.show(self.index - 1); });
    this.nextBtn.addEventListener('click', function () { self.show(self.index + 1); });

    /* Arrow keys, but only while the gallery has focus — a document-level
       handler would steal the arrow keys used to scroll the page. */
    this.root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { self.show(self.index - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { self.show(self.index + 1); e.preventDefault(); }
    });

    /* Swipe. Only on image items, so it never fights with video controls. */
    var x0 = null, y0 = null;
    this.stage.addEventListener('pointerdown', function (e) {
      if (self.items[self.index] && self.items[self.index].type !== 'image') { x0 = null; return; }
      x0 = e.clientX; y0 = e.clientY;
    });
    this.stage.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      /* Ignore mostly-vertical drags so page scrolling still works. */
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
      self.show(dx < 0 ? self.index + 1 : self.index - 1);
    });
    this.stage.addEventListener('pointercancel', function () { x0 = null; });
  };

  window.PetGallery = {
    mount: function (root, items, lang) {
      if (!root) return null;
      return new Gallery(root, items, lang);
    }
  };
})();
