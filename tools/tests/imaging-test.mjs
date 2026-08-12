/*
 * Client-side image resizing.
 *
 * jsdom has no canvas, so one is stubbed here. That is enough to exercise the
 * part worth testing — the sizing arithmetic and which profile does what —
 * without dragging in a native canvas dependency the site itself never needs.
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let fails = 0;
const check = (n, c, e = '') => {
  if (c) console.log(`  ok   ${n}`);
  else { console.log(`  FAIL ${n} ${e}`); fails++; }
};

const PRELUDE = `
window.__canvases = [];
window.__draws = [];
window.__encodeAs = 'image/webp';

var realCreate = document.createElement.bind(document);
document.createElement = function (tag) {
  if (String(tag).toLowerCase() !== 'canvas') return realCreate(tag);
  var canvas = {
    width: 0, height: 0,
    getContext: function () {
      return {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'low',
        drawImage: function (src, a, b, c, d) {
          window.__draws.push({ dx: a, dy: b, dw: c, dh: d,
                                onto: { w: canvas.width, h: canvas.height } });
        }
      };
    },
    toBlob: function (cb, type, quality) {
      if (type !== window.__encodeAs) { cb(null); return; }
      /* Size roughly proportional to pixels, so the reported saving is
         meaningful rather than constant. */
      var bytes = Math.max(1, Math.round(canvas.width * canvas.height * quality * 0.05));
      cb({ type: type, size: bytes });
    }
  };
  window.__canvases.push(canvas);
  return canvas;
};

/* A decoded image of a fixed size, standing in for the real bitmap. */
window.__bitmap = { width: 4000, height: 3000, close: function () { this.closed = true; } };
window.createImageBitmap = function () {
  return Promise.resolve(window.__bitmap);
};
`;

function boot() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously', url: 'https://x.org/admin.html',
  });
  const w = dom.window;
  const pre = w.document.createElement('script');
  pre.textContent = PRELUDE;
  w.document.head.appendChild(pre);

  const s = w.document.createElement('script');
  s.textContent = readFileSync(join(ROOT, 'assets/imaging.js'), 'utf8');
  w.document.head.appendChild(s);
  return w;
}

const fileOf = (w, type, size, name = 'photo.jpg') => ({ type, size, name });

/* ------------------------------------------------------------ profiles - */
console.log('\nProfiles');
{
  const w = boot();
  check('exposes the expected recipes',
    ['photo', 'portrait', 'thumbnail', 'document', 'raw'].every((p) => w.PetImaging.profiles.includes(p)),
    w.PetImaging.profiles.join(','));

  check('a jpeg is an image', w.PetImaging.isImage({ type: 'image/jpeg' }) === true);
  check('mp4 is not', w.PetImaging.isImage({ type: 'video/mp4' }) === false);
  /* SVG through a canvas would rasterise a vector — worse, not smaller. */
  check('svg is left alone', w.PetImaging.isImage({ type: 'image/svg+xml' }) === false);
}

/* -------------------------------------------------------------- photo -- */
console.log('\nphoto profile (galleries and cards)');
{
  const w = boot();
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 5 * 1024 * 1024), 'photo');

  check('returns a processed result', !!out);
  check('long edge capped at 1600', out.width === 1600, `${out.width}x${out.height}`);
  check('aspect ratio preserved', out.height === 1200, `${out.width}x${out.height}`);
  check('produces a thumbnail too', !!out.thumb);
  check('encodes WebP', out.ext === 'webp' && out.full.type === 'image/webp');
  check('reports the original size', out.originalBytes === 5 * 1024 * 1024);
  check('processed is smaller than the original', out.bytes < out.originalBytes,
    `${out.bytes} vs ${out.originalBytes}`);
  check('bitmap released', w.__bitmap.closed === true);

  /* The 400x400 thumbnail is a centre crop, exactly like build_media.py. */
  const square = w.__canvases.find((c) => c.width === 400 && c.height === 400);
  check('thumbnail canvas is 400x400', !!square);
  const cropDraw = w.__draws.filter((d) => d.onto.w === 400 && d.onto.h === 400)[0];
  check('thumbnail is centre-cropped, not squashed',
    cropDraw && Math.abs(cropDraw.dw / cropDraw.dh - 4 / 3) < 0.01,
    cropDraw && `${cropDraw.dw}x${cropDraw.dh}`);
  check('crop offset centres the image',
    cropDraw && cropDraw.dx < 0 && Math.abs(cropDraw.dy) < 0.01,
    cropDraw && `dx=${cropDraw.dx} dy=${cropDraw.dy}`);
}

console.log('\nphoto profile: portrait orientation');
{
  const w = boot();
  w.__bitmap = { width: 3000, height: 4000, close() {} };
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 4e6), 'photo');
  check('caps the long edge, whichever it is',
    out.height === 1600 && out.width === 1200, `${out.width}x${out.height}`);
}

console.log('\nphoto profile: already small');
{
  const w = boot();
  w.__bitmap = { width: 800, height: 600, close() {} };
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 120000), 'photo');
  /* Upscaling would produce a bigger file and no more detail. */
  check('never enlarges a small photo',
    out.width === 800 && out.height === 600, `${out.width}x${out.height}`);
}

/* ----------------------------------------------------------- portrait -- */
console.log('\nportrait profile (curator photo)');
{
  const w = boot();
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 3e6), 'portrait');
  check('square 600x600', out.width === 600 && out.height === 600, `${out.width}x${out.height}`);
  check('no separate thumbnail', out.thumb === null);
}

/* ----------------------------------------------------------- document -- */
console.log('\ndocument profile (vet scans)');
{
  const w = boot();
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 6e6), 'document');
  check('allowed up to 2000px so text stays legible',
    out.width === 2000 && out.height === 1500, `${out.width}x${out.height}`);
  check('not cropped', out.height === 1500);
  check('no thumbnail', out.thumb === null);

  /* A scan compressed like a snapshot becomes unreadable, so quality is
     higher — same pixels, more bytes than the photo profile would use. */
  const photo = await boot().PetImaging.prepare(fileOf(w, 'image/jpeg', 6e6), 'photo');
  const perPixelDoc = out.bytes / (out.width * out.height);
  const perPixelPhoto = photo.bytes / (photo.width * photo.height);
  check('kept at a higher quality than gallery photos',
    perPixelDoc > perPixelPhoto, `${perPixelDoc.toFixed(3)} vs ${perPixelPhoto.toFixed(3)}`);
}

/* ---------------------------------------------------------------- raw -- */
console.log('\nraw profile and pass-through cases');
{
  const w = boot();
  check('raw returns null so the caller uploads the original',
    (await w.PetImaging.prepare(fileOf(w, 'image/png', 5000), 'raw')) === null);
  check('video is never touched',
    (await w.PetImaging.prepare(fileOf(w, 'video/mp4', 9e6), 'photo')) === null);
  check('pdf is never touched',
    (await w.PetImaging.prepare(fileOf(w, 'application/pdf', 3e5), 'document')) === null);
  check('missing file handled',
    (await w.PetImaging.prepare(null, 'photo')) === null);
}

/* ------------------------------------------------------------ fallback - */
console.log('\nFailure handling');
{
  const w = boot();
  w.createImageBitmap = function () { return Promise.reject(new Error('decode failed')); };
  /* The <img> fallback cannot work in jsdom either, so this exercises the
     "give up and upload the original" path. */
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 4e6), 'photo');
  check('a decode failure resolves to null rather than rejecting', out === null);
}
{
  const w = boot();
  w.__encodeAs = 'image/jpeg';   // pretend the browser cannot encode WebP
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 4e6), 'photo');
  check('falls back to JPEG when WebP is unavailable',
    out && out.ext === 'jpg' && out.full.type === 'image/jpeg',
    out && out.full.type);
}
{
  const w = boot();
  w.__encodeAs = 'nothing';      // both encoders refuse
  const out = await w.PetImaging.prepare(fileOf(w, 'image/jpeg', 4e6), 'photo');
  check('an encoder failure also resolves to null', out === null);
}

/* --------------------------------------------------------- formatBytes - */
console.log('\nformatBytes');
{
  const w = boot();
  const f = w.PetImaging.formatBytes;
  check('bytes', f(512) === '512 B', f(512));
  check('kilobytes', f(150 * 1024) === '150 KB', f(150 * 1024));
  check('megabytes', f(5.5 * 1024 * 1024) === '5.5 MB', f(5.5 * 1024 * 1024));
}

console.log(fails === 0 ? '\nAll imaging tests passed.' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
