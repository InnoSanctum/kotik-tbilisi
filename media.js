/*
 * Что показывать в галерее. Это единственный файл, который нужно править,
 * когда появляется новое фото или видео.
 *
 * Три типа записей:
 *   { "type": "image",   "src": "media/x.webp", "thumb": "media/thumbs/x.webp", "alt": {...} }
 *   { "type": "video",   "src": "media/x.mp4",  "thumb": "media/thumbs/x.webp", "alt": {...} }
 *   { "type": "youtube", "id":  "VIDEO_ID",     "thumb": "media/thumbs/x.webp", "alt": {...} }
 *
 * "alt" — описание для незрячих и для поисковиков, по строке на каждый язык.
 *
 * ВАЖНО: первая запись продублирована в index.html (тег <img> и <link rel="preload">),
 * чтобы главное фото начинало грузиться сразу. Меняете первую запись —
 * поправьте и две строки в index.html. Проверить: python tools/check_site.py
 */
window.KOTIK_MEDIA = [
  {
    "type": "image",
    "src": "media/kotik-2026-03-12.webp",
    "thumb": "media/thumbs/kotik-2026-03-12.webp",
    "alt": {
      "ru": "Котик спит, свернувшись клубком, на пледе",
      "en": "Kotik curled up asleep on a blanket",
      "ka": "კოტიკს გორგალივით დახვეულს სძინავს საბანზე"
    }
  },
  {
    "type": "image",
    "src": "media/kotik-2025-09-08.webp",
    "thumb": "media/thumbs/kotik-2025-09-08.webp",
    "alt": {
      "ru": "Котик сидит на деревянном полу и смотрит в сторону",
      "en": "Kotik sitting on a wooden floor, looking to one side",
      "ka": "კოტიკი ხის იატაკზე ზის და გვერდით იყურება"
    }
  },
  {
    "type": "image",
    "src": "media/kotik-2025-11-06.webp",
    "thumb": "media/thumbs/kotik-2025-11-06.webp",
    "alt": {
      "ru": "Котик спит на кровати рядом с жёлтой подушкой",
      "en": "Kotik asleep on a bed next to a yellow pillow",
      "ka": "კოტიკს საწოლზე, ყვითელი ბალიშის გვერდით სძინავს"
    }
  },
  {
    "type": "image",
    "src": "media/kotik-2025-11-16.webp",
    "thumb": "media/thumbs/kotik-2025-11-16.webp",
    "alt": {
      "ru": "Котик спит на диване, спрятав лапы",
      "en": "Kotik asleep on the sofa with his paws tucked in",
      "ka": "კოტიკს დივანზე სძინავს, თათებამოკეცილს"
    }
  },
  {
    "type": "image",
    "src": "media/kotik-2025-11-30.webp",
    "thumb": "media/thumbs/kotik-2025-11-30.webp",
    "alt": {
      "ru": "Котик спит на спине, раскинувшись на пледе",
      "en": "Kotik sleeping on his back, stretched out on a blanket",
      "ka": "კოტიკს ზურგზე გაშოტილს სძინავს საბანზე"
    }
  },
  {
    "type": "image",
    "src": "media/kotik-2026-05-04.webp",
    "thumb": "media/thumbs/kotik-2026-05-04.webp",
    "alt": {
      "ru": "Котика держат на руках, он мяукает",
      "en": "Kotik being held in someone's arms, meowing",
      "ka": "კოტიკი ხელში უჭირავთ და კნავის"
    }
  },
  {
    "type": "image",
    "src": "media/kotik-2026-05-04a.webp",
    "thumb": "media/thumbs/kotik-2026-05-04a.webp",
    "alt": {
      "ru": "Крупный план мордочки Котика",
      "en": "Close-up of Kotik's face",
      "ka": "კოტიკის სახის ახლო ხედი"
    }
  }
];
