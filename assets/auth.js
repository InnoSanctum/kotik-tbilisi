/*
 * Admin authentication against Supabase Auth (GoTrue), over plain REST.
 *
 * No SDK: sign-in is one POST, refresh is another, and that keeps the whole
 * site a build-free set of <script> tags.
 *
 * What actually protects the data is *not* this file. A determined visitor can
 * edit any of this in devtools. The real gate is Row Level Security in
 * supabase/schema.sql: writing to `pets` requires a JWT belonging to a row in
 * `admins`, and — if you enable it — a request IP on the allowlist. This module
 * only decides what the admin UI shows.
 *
 * Tokens live in localStorage, which is what the Supabase SDK does too. The
 * trade-off is deliberate: an XSS on the admin page could read them, so the
 * admin page loads no third-party script beyond the fonts and icon CSS that
 * every page already uses.
 */
(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var sb = cfg.supabase || {};
  var URL_BASE = (sb.url || '').replace(/\/+$/, '');
  var ANON = sb.anonKey || '';
  var STORAGE_KEY = 'pet-admin-session';

  /* Refresh a minute early: a token that expires mid-save turns a successful
     edit into a confusing 401. */
  var REFRESH_MARGIN_MS = 60 * 1000;

  var session = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function store(next) {
    session = next;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function authUrl(path) { return URL_BASE + '/auth/v1/' + path; }

  function post(path, body, token) {
    var headers = { apikey: ANON, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(authUrl(path), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error_description || data.msg || data.error || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function adopt(data) {
    if (!data || !data.access_token) throw new Error('no access token in response');
    store({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + ((data.expires_in || 3600) * 1000),
      user: data.user || null
    });
    return session;
  }

  function signIn(email, password) {
    if (!URL_BASE || !ANON) return Promise.reject(new Error('not-configured'));
    return post('token?grant_type=password', { email: email, password: password }).then(adopt);
  }

  function signOut() {
    var token = session && session.accessToken;
    store(null);
    if (!token || !URL_BASE) return Promise.resolve();
    /* Best-effort server-side revoke; the local session is already gone. */
    return post('logout', {}, token).catch(function () {});
  }

  function refresh() {
    if (!session || !session.refreshToken) return Promise.reject(new Error('no-session'));
    return post('token?grant_type=refresh_token', { refresh_token: session.refreshToken })
      .then(adopt)
      .catch(function (err) {
        /* A refresh token that Supabase no longer recognises is unrecoverable —
           drop the session so the UI falls back to the sign-in form. */
        store(null);
        throw err;
      });
  }

  /* Returns a valid token, refreshing first if the current one is close to
     expiry. Everything that writes should await this rather than reading
     accessToken() directly. */
  function ensureFresh() {
    if (!session) return Promise.resolve(null);
    if (Date.now() < session.expiresAt - REFRESH_MARGIN_MS) {
      return Promise.resolve(session.accessToken);
    }
    return refresh().then(function (s) { return s.accessToken; })
                    .catch(function () { return null; });
  }

  window.PetAuth = {
    configured: !!(URL_BASE && ANON),
    signIn: signIn,
    signOut: signOut,
    refresh: refresh,
    ensureFresh: ensureFresh,
    accessToken: function () { return session ? session.accessToken : null; },
    user: function () { return session ? session.user : null; },
    isSignedIn: function () { return !!(session && session.accessToken); }
  };
})();
