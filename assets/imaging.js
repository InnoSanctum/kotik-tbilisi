/*
 * Shrink photos in the browser before they are uploaded.
 *
 * A phone photo is 3–8 MB. The site never displays one larger than about
 * 1600px, so uploading the original wastes the free storage tier, wastes the
 * visitor's data, and slows the page down for no visible gain.
 *
 * Deliberately mirrors tools/build_media.py — 1600px long edge at quality 82,
 * 400x400 centre-cropped thumbnails at 80 — so a photo added through the admin
 * is indistinguishable from one added by the script.
 *
 * Two things fall out of re-encoding through a canvas, both wanted:
 *
 *   * EXIF orientation is baked in, so a portrait photo taken on a phone stops
 *     appearing sideways;
 *   * every other piece of metadata is dropped — including GPS coordinates and
 *     the camera model. Publishing the home address of someone fostering an
 *     animal, encoded invisibly in a photo, is a real risk and this removes it.
 *
 * Not everything should be squeezed. Vet documents have to stay readable, a QR
 * image must not be re-encoded at all (lossy artefacts break scanning), and
 * video is passed straight through — transcoding it in a browser is not
 * something to attempt here.
 */
(function () {
  'use strict';

  var PROFILES = {
    /* Animal and gig photos: what the galleries show. */
    photo: { maxEdge: 1600, quality: 0.82, thumb: 400, thumbQuality: 0.8 },

    /* Curator portrait. Square, matching the existing assets/author.webp. */
    portrait: { maxEdge: 600, quality: 0.82, square: true, thumb: 0 },

    /* A thumbnail chosen by hand, for the field that overrides the generated
       one. Same 400px square as the automatic version. */
    thumbnail: { maxEdge: 400, quality: 0.8, square: true, thumb: 0 },

    /* Scans and test results: legible beats small, so barely compressed and
       never cropped. */
    document: { maxEdge: 2000, quality: 0.92, thumb: 0 },

    /* QR codes and anything else that must survive byte-for-byte. */
    raw: null
  };

  function isImage(file) {
    return !!file && /^image\//.test(file.type) && !/svg/.test(file.type);
  }

  /*
   * Decode with orientation applied. createImageBitmap does this natively and
   * off the main thread; the <img> fallback is for browsers that lack the
   * option, where modern ones already auto-orient.
   */
  function decode(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return createImageBitmap(file, { imageOrientation: 'from-image' })
          .catch(function () { return decodeViaImg(file); });
      } catch (e) {
        return decodeViaImg(file);
      }
    }
    return decodeViaImg(file);
  }

  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('could not decode the image')); };
      img.src = url;
    });
  }

  function canvasOf(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { canvas: canvas, ctx: ctx };
  }

  /*
   * Halve repeatedly until within 2x of the target, then do the final step.
   * A single large downscale in one drawImage aliases badly — fur and whiskers
   * turn to noise — because the browser samples rather than averages.
   */
  function shrinkTo(source, width, height, targetW, targetH) {
    var current = source, cw = width, ch = height;

    while (cw / 2 > targetW && ch / 2 > targetH) {
      var half = canvasOf(cw / 2, ch / 2);
      half.ctx.drawImage(current, 0, 0, half.canvas.width, half.canvas.height);
      current = half.canvas;
      cw = half.canvas.width;
      ch = half.canvas.height;
    }
    return { source: current, width: cw, height: ch };
  }

  function renderContain(bitmap, maxEdge) {
    var w = bitmap.width, h = bitmap.height;
    /* Only ever shrink. Blowing a small photo up just makes a bigger file. */
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    var targetW = Math.round(w * scale), targetH = Math.round(h * scale);

    var stepped = shrinkTo(bitmap, w, h, targetW, targetH);
    var out = canvasOf(targetW, targetH);
    out.ctx.drawImage(stepped.source, 0, 0, targetW, targetH);
    return out.canvas;
  }

  function renderCover(bitmap, size) {
    var w = bitmap.width, h = bitmap.height;
    var side = Math.min(size, Math.max(w, h));
    var scale = Math.max(side / w, side / h);
    var drawW = Math.round(w * scale), drawH = Math.round(h * scale);

    var stepped = shrinkTo(bitmap, w, h, drawW, drawH);
    var out = canvasOf(side, side);
    /* Centre crop, same as ImageOps.fit(centering=(0.5, 0.5)). */
    out.ctx.drawImage(stepped.source, (side - drawW) / 2, (side - drawH) / 2, drawW, drawH);
    return out.canvas;
  }

  /* Canvas -> WebP, falling back to JPEG if the browser will not encode WebP. */
  function encode(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob && blob.type === 'image/webp') { resolve(blob); return; }
        canvas.toBlob(function (jpeg) {
          if (jpeg) resolve(jpeg);
          else reject(new Error('the browser could not encode the image'));
        }, 'image/jpeg', quality);
      }, 'image/webp', quality);
    });
  }

  function extensionFor(blob) {
    return blob && blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  }

  /*
   * Returns { full, thumb, ext, originalBytes, bytes, width, height } — or
   * null when the file should be uploaded untouched (video, PDF, an unknown
   * type, or the 'raw' profile).
   *
   * Never rejects on a processing failure: if anything goes wrong the caller
   * falls back to uploading the original, because a slightly large photo is a
   * far better outcome than a failed upload.
   */
  function prepare(file, profileName) {
    var profile = PROFILES[profileName || 'photo'];
    if (!profile || !isImage(file)) return Promise.resolve(null);

    return decode(file).then(function (bitmap) {
      var canvas = profile.square
        ? renderCover(bitmap, profile.maxEdge)
        : renderContain(bitmap, profile.maxEdge);

      return encode(canvas, profile.quality).then(function (full) {
        var result = {
          full: full,
          thumb: null,
          ext: extensionFor(full),
          originalBytes: file.size,
          bytes: full.size,
          width: canvas.width,
          height: canvas.height
        };

        if (!profile.thumb) return result;

        var thumbCanvas = renderCover(bitmap, profile.thumb);
        return encode(thumbCanvas, profile.thumbQuality).then(function (thumb) {
          result.thumb = thumb;
          result.bytes += thumb.size;
          return result;
        });
      }).then(function (result) {
        if (bitmap.close) bitmap.close();   // free the decoded bitmap promptly
        return result;
      });
    }).catch(function (err) {
      console.warn('[imaging] leaving the file untouched: ' + err.message);
      return null;
    });
  }

  function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  window.PetImaging = {
    prepare: prepare,
    isImage: isImage,
    formatBytes: formatBytes,
    profiles: Object.keys(PROFILES)
  };
})();
