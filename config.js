/*
 * Site configuration.  Edit this file, commit, done — no build step.
 *
 * The site works with NO configuration at all: leave supabase blank and every
 * page renders from data/pets.js (the static seed).  Fill supabase in and the
 * same pages start reading live rows instead, with data/pets.js kept as the
 * offline fallback if the network or the project is down.
 *
 * The anon key is *designed* to be public — it is shipped in the browser by
 * every Supabase site.  It is safe here because Row Level Security in
 * supabase/schema.sql only permits reading published pets; every write demands
 * a logged-in admin.  Never put the service_role key in this file.
 */
window.SITE_CONFIG = {
  /* ---------------------------------------------------------- data source */
  supabase: {
    url: 'https://zcmeuusdvlkxkjlhauyr.supabase.co',      // e.g. 'https://abcdefghijklm.supabase.co'
    anonKey: 'sb_publishable_O3Q5m36SexUm8lVFtqmm6Q_nOTngR4Z'   // the "anon / public" key from Project Settings -> API
  },

  /* Static seed is always the fallback. Set to false to show an error banner
     instead of stale data when Supabase is unreachable. */
  fallbackToStaticData: true,

  /* ------------------------------------------------------------ languages */
  languages: ['ru', 'en', 'ka'],
  fallbackLanguage: 'ru',   // what to render when a translation is missing

  /* --------------------------------------------------------------- brand */
  site: {
    donateCurrency: 'GEL',
    instagram: 'https://www.instagram.com/mserhiievskyi/',
    telegram: 'https://t.me/innosanctum',
    email: 'innosanctum@gmail.com'
  },

  /* --------------------------------------------------------------- admin */
  admin: {
    /* Admin sign-in uses Supabase Auth (email + password) for the single
       admin user. Writes are gated by RLS server-side, so a tampered client
       cannot save anything. */
    enabled: true,

    /* Optional second factor: an IP allowlist.
       IMPORTANT — this array is only a *hint* for the UI. Real enforcement
       lives in Postgres (see admin_ip_allowlist in supabase/schema.sql) and,
       on Vercel, in middleware.js. A browser-side check alone is worthless:
       anyone can edit JavaScript. Keep the list in the database in sync. */
    ipAllowlistHint: []
  }
};
