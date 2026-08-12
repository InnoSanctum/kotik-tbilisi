/*
 * Localisation.
 *
 * Two separate things live here:
 *
 *   1. UI_STRINGS — chrome that belongs to the site itself (buttons, headings,
 *      empty states). Translated once, here.
 *
 *   2. pick() — the resolver for *content* coming from the database. Pet text
 *      is stored as a plain map, {"ru": "...", "en": "..."}. Russian is the
 *      language the cards are filled in, so anything missing falls back to it.
 *
 * Because content is just a map, a pet may carry languages this file has never
 * heard of ({"ru":…, "pl":…}) and pick() will serve them to a visitor whose
 * language is set to 'pl'. Adding a language to the *chrome* means adding a
 * block to UI_STRINGS; adding one to a *pet* means only typing it in the admin.
 */
(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var LANGS = cfg.languages || ['ru', 'en', 'ka'];
  var FALLBACK = cfg.fallbackLanguage || 'ru';
  var STORAGE_KEY = 'pet-site-lang';

  var UI_STRINGS = {
    ru: {
      brand: 'Помощь животным',
      brandShort: 'Помощь животным',
      navAbout: 'О проекте',
      navPets: 'Питомцы',
      navContacts: 'Контакты',
      heroTitle: 'Помощь уличным животным в Тбилиси',
      heroSubtitle: 'Лечение, передержка и поиск дома для тех, у кого нет своего.',
      heroCta: 'Посмотреть подопечных',
      aboutTitle: 'О проекте',
      petsTitle: 'Наши подопечные',
      petsSubtitle: 'Нажмите на карточку, чтобы открыть полную историю, галерею и контакты куратора.',
      searchLabel: 'Поиск',
      searchPlaceholder: 'Имя, тег или город…',
      tagsLabel: 'Теги',
      tagAll: 'Все',
      resultsOne: 'Найден 1 подопечный',
      resultsMany: 'Найдено подопечных: {n}',
      noResults: 'Никого не найдено. Попробуйте другой тег или слово.',
      clearFilters: 'Сбросить фильтры',
      cardMore: 'Подробнее',
      backToList: 'Ко всем подопечным',
      notFoundTitle: 'Страница не найдена',
      notFoundText: 'Такого подопечного нет или ссылка устарела.',
      loading: 'Загрузка…',
      storyTitle: 'История',
      galleryTitle: 'Галерея',
      videoTitle: 'Видео',
      videoPlay: 'Смотреть видео',
      donateTitle: 'Поддержать',
      donateButton: 'Перевести',
      qrCaption: 'Сканируйте QR для быстрого перевода',
      carePlanTitle: 'Медицинский статус и план',
      docsTitle: 'Документы и анализы',
      curatorTitle: 'Куратор',
      contactsTitle: 'Контакты',
      contactsText: 'Есть вопрос, хотите забрать животное домой или помочь иначе — напишите.',
      galleryPrev: 'Предыдущее фото',
      galleryNext: 'Следующее фото',
      statusDone: 'Сделано',
      statusNeeded: 'Требуется',
      footerRights: 'Сбор средств для уличных животных, Тбилиси.',
      dataStale: 'Показаны сохранённые данные: база временно недоступна.',
      /* admin */
      adminTitle: 'Панель управления',
      adminSignIn: 'Вход',
      adminEmail: 'Электронная почта',
      adminPassword: 'Пароль',
      adminSignInBtn: 'Войти',
      adminSignOut: 'Выйти',
      adminNewPet: 'Добавить подопечного',
      adminEdit: 'Редактировать',
      adminDelete: 'Удалить',
      adminSave: 'Сохранить',
      adminCancel: 'Отмена',
      adminSaved: 'Сохранено.',
      adminDeleted: 'Запись удалена.',
      adminConfirmDelete: 'Удалить запись «{name}»? Это действие необратимо.',
      adminNotConfigured: 'Supabase не настроен. Заполните config.js, чтобы включить редактирование.',
      adminBadCreds: 'Неверная почта или пароль.',
      adminForbidden: 'Доступ запрещён. Возможно, ваш IP не в списке разрешённых.',
      adminPublished: 'Опубликован',
      adminDraft: 'Черновик'
    },

    en: {
      brand: 'Help Pets',
      brandShort: 'Help Pets',
      navAbout: 'About',
      navPets: 'Pets',
      navContacts: 'Contacts',
      heroTitle: 'Helping street animals in Tbilisi',
      heroSubtitle: 'Treatment, fostering, and finding homes for those who have none.',
      heroCta: 'Meet the animals',
      aboutTitle: 'About the project',
      petsTitle: 'Our animals',
      petsSubtitle: 'Open a card for the full story, gallery, and curator contacts.',
      searchLabel: 'Search',
      searchPlaceholder: 'Name, tag, or city…',
      tagsLabel: 'Tags',
      tagAll: 'All',
      resultsOne: '1 animal found',
      resultsMany: '{n} animals found',
      noResults: 'Nothing found. Try another tag or keyword.',
      clearFilters: 'Clear filters',
      cardMore: 'Read more',
      backToList: 'All animals',
      notFoundTitle: 'Page not found',
      notFoundText: 'This animal does not exist, or the link is out of date.',
      loading: 'Loading…',
      storyTitle: 'Story',
      galleryTitle: 'Gallery',
      videoTitle: 'Video',
      videoPlay: 'Play video',
      donateTitle: 'Support',
      donateButton: 'Donate',
      qrCaption: 'Scan the QR code to donate quickly',
      carePlanTitle: 'Medical status & plan',
      docsTitle: 'Documents & test results',
      curatorTitle: 'Curator',
      contactsTitle: 'Contacts',
      contactsText: 'Questions, adoption, or another way to help — get in touch.',
      galleryPrev: 'Previous photo',
      galleryNext: 'Next photo',
      statusDone: 'Done',
      statusNeeded: 'Needed',
      footerRights: 'Fundraising for street animals, Tbilisi.',
      dataStale: 'Showing saved data: the database is temporarily unavailable.',
      adminTitle: 'Admin panel',
      adminSignIn: 'Sign in',
      adminEmail: 'Email',
      adminPassword: 'Password',
      adminSignInBtn: 'Sign in',
      adminSignOut: 'Sign out',
      adminNewPet: 'Add an animal',
      adminEdit: 'Edit',
      adminDelete: 'Delete',
      adminSave: 'Save',
      adminCancel: 'Cancel',
      adminSaved: 'Saved.',
      adminDeleted: 'Record deleted.',
      adminConfirmDelete: 'Delete “{name}”? This cannot be undone.',
      adminNotConfigured: 'Supabase is not configured. Fill in config.js to enable editing.',
      adminBadCreds: 'Wrong email or password.',
      adminForbidden: 'Access denied. Your IP may not be on the allowlist.',
      adminPublished: 'Published',
      adminDraft: 'Draft'
    },

    ka: {
      brand: 'დახმარება ცხოველებს',
      brandShort: 'დახმარება ცხოველებს',
      navAbout: 'პროექტის შესახებ',
      navPets: 'ცხოველები',
      navContacts: 'კონტაქტი',
      heroTitle: 'ქუჩის ცხოველების დახმარება თბილისში',
      heroSubtitle: 'მკურნალობა, დროებითი თავშესაფარი და სახლის პოვნა მათთვის, ვისაც არ აქვს.',
      heroCta: 'ნახეთ ჩვენი ცხოველები',
      aboutTitle: 'პროექტის შესახებ',
      petsTitle: 'ჩვენი ცხოველები',
      petsSubtitle: 'დააჭირეთ ბარათს სრული ისტორიის, გალერეისა და კურატორის კონტაქტებისთვის.',
      searchLabel: 'ძებნა',
      searchPlaceholder: 'სახელი, თეგი ან ქალაქი…',
      tagsLabel: 'თეგები',
      tagAll: 'ყველა',
      resultsOne: 'ნაპოვნია 1 ცხოველი',
      resultsMany: 'ნაპოვნია {n} ცხოველი',
      noResults: 'ვერაფერი მოიძებნა. სცადეთ სხვა თეგი ან სიტყვა.',
      clearFilters: 'ფილტრების გასუფთავება',
      cardMore: 'ვრცლად',
      backToList: 'ყველა ცხოველი',
      notFoundTitle: 'გვერდი ვერ მოიძებნა',
      notFoundText: 'ასეთი ცხოველი არ არსებობს, ან ბმული მოძველებულია.',
      loading: 'იტვირთება…',
      storyTitle: 'ისტორია',
      galleryTitle: 'გალერეა',
      videoTitle: 'ვიდეო',
      videoPlay: 'ვიდეოს ყურება',
      donateTitle: 'მხარდაჭერა',
      donateButton: 'გადარიცხვა',
      qrCaption: 'დაასკანერეთ QR კოდი სწრაფი გადარიცხვისთვის',
      carePlanTitle: 'სამედიცინო სტატუსი და გეგმა',
      docsTitle: 'დოკუმენტები და ანალიზები',
      curatorTitle: 'კურატორი',
      contactsTitle: 'კონტაქტი',
      contactsText: 'შეკითხვა, ცხოველის აყვანა ან სხვაგვარად დახმარება — მოგვწერეთ.',
      galleryPrev: 'წინა ფოტო',
      galleryNext: 'შემდეგი ფოტო',
      statusDone: 'შესრულებულია',
      statusNeeded: 'საჭიროა',
      footerRights: 'თანხის შეგროვება ქუჩის ცხოველებისთვის, თბილისი.',
      dataStale: 'ნაჩვენებია შენახული მონაცემები: ბაზა დროებით მიუწვდომელია.',
      adminTitle: 'ადმინ პანელი',
      adminSignIn: 'შესვლა',
      adminEmail: 'ელფოსტა',
      adminPassword: 'პაროლი',
      adminSignInBtn: 'შესვლა',
      adminSignOut: 'გასვლა',
      adminNewPet: 'ცხოველის დამატება',
      adminEdit: 'რედაქტირება',
      adminDelete: 'წაშლა',
      adminSave: 'შენახვა',
      adminCancel: 'გაუქმება',
      adminSaved: 'შენახულია.',
      adminDeleted: 'ჩანაწერი წაშლილია.',
      adminConfirmDelete: 'წავშალოთ „{name}“? ამის დაბრუნება შეუძლებელია.',
      adminNotConfigured: 'Supabase არ არის კონფიგურირებული. შეავსეთ config.js რედაქტირების ჩასართავად.',
      adminBadCreds: 'არასწორი ელფოსტა ან პაროლი.',
      adminForbidden: 'წვდომა აკრძალულია. თქვენი IP შესაძლოა ნებადართულ სიაში არ იყოს.',
      adminPublished: 'გამოქვეყნებული',
      adminDraft: 'მონახაზი'
    }
  };

  /* ------------------------------------------------------------ language */

  function normalise(code) {
    if (!code) return null;
    var short = String(code).slice(0, 2).toLowerCase();
    if (short === 'ge') short = 'ka';           // common mix-up: GE is the country
    return LANGS.indexOf(short) !== -1 ? short : null;
  }

  function stored() {
    try { return normalise(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }

  function fromUrl() {
    try { return normalise(new URLSearchParams(location.search).get('lang')); } catch (e) { return null; }
  }

  var current = fromUrl() || stored() || normalise(navigator.language) || FALLBACK;

  function getLang() { return current; }

  function setLang(code) {
    var next = normalise(code);
    if (!next || next === current) return false;
    current = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    document.documentElement.lang = next;
    return true;
  }

  /* --------------------------------------------------------------- text */

  /* UI chrome. {n}-style placeholders are substituted from `vars`. */
  function t(key, vars) {
    var table = UI_STRINGS[current] || UI_STRINGS[FALLBACK] || {};
    var base = UI_STRINGS[FALLBACK] || {};
    var out = table[key];
    if (out === undefined) out = base[key];
    if (out === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        out = out.split('{' + k + '}').join(vars[k]);
      });
    }
    return out;
  }

  /*
   * Database content. Accepts a {lang: string} map or a bare string, and walks
   * requested language -> Russian -> English -> whatever else is filled in.
   * A pet translated only into Russian therefore still renders everywhere,
   * which is exactly the brief.
   */
  function pick(value, lang) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return String(value);

    var want = lang || current;
    if (value[want]) return value[want];
    if (value[FALLBACK]) return value[FALLBACK];
    if (value.en) return value.en;

    /* Last resort: any language that is filled in. Structural keys that travel
       inside the same object — a tag's `id` — are skipped, otherwise an
       untranslated tag would render as "needs-home" instead of a label. */
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== 'id' && value[keys[i]]) return value[keys[i]];
    }
    /* Nothing translated at all: the id at least names the thing. */
    return value.id || '';
  }

  /* Which languages does this record actually carry? Used by the admin to
     show "ru, en" chips and by pet pages to emit <link rel="alternate">. */
  function langsPresent(value) {
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value).filter(function (k) { return !!value[k]; });
  }

  window.I18N = {
    LANGS: LANGS,
    FALLBACK: FALLBACK,
    strings: UI_STRINGS,
    getLang: getLang,
    setLang: setLang,
    t: t,
    pick: pick,
    langsPresent: langsPresent
  };
})();
