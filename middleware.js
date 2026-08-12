/*
 * Vercel Edge Middleware — optional IP gate for the admin page.
 *
 * INERT ON GITHUB PAGES. GitHub Pages serves static files only and never runs
 * this file, which is exactly why the authoritative allowlist lives in
 * Postgres (public.admin_ip_allowlist, see supabase/schema.sql). That one is
 * enforced on every write regardless of where the site is hosted.
 *
 * What this adds on Vercel is defence in depth: the admin HTML is not even
 * served to an address that is not on the list, so a stolen password is not
 * enough on its own and the login form is not exposed to the internet at all.
 *
 * Enable it by setting ADMIN_IP_ALLOWLIST in the Vercel project's environment
 * variables — a comma-separated list of addresses or CIDR ranges:
 *
 *   ADMIN_IP_ALLOWLIST="203.0.113.42, 198.51.100.0/24"
 *
 * Leave it unset and the middleware does nothing, so the first deploy cannot
 * accidentally lock you out.
 */

export const config = {
  matcher: ['/admin', '/admin.html']
};

function parseList(raw) {
  return (raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/* IPv4 dotted quad -> 32-bit integer. Returns null for anything else,
   including IPv6, which falls back to exact string comparison below. */
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = (out << 8) + n;
  }
  return out >>> 0;
}

function matches(ip, rule) {
  if (!rule.includes('/')) return ip === rule;

  const [range, bitsRaw] = rule.split('/');
  const bits = Number(bitsRaw);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null || !(bits >= 0 && bits <= 32)) return false;

  /* A /0 would shift by 32, which is a no-op in JS rather than a wipe. */
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export default function middleware(request) {
  const allowlist = parseList(process.env.ADMIN_IP_ALLOWLIST);

  // Not configured => feature off. Postgres is still enforcing its own list.
  if (allowlist.length === 0) return;

  /* Trust only the platform's own header. Reading a raw X-Forwarded-For the
     client can set would make the whole check spoofable. */
  const ip = request.headers.get('x-real-ip') ||
             (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();

  if (ip && allowlist.some((rule) => matches(ip, rule))) return;

  return new Response('Not found', {
    status: 404,                       // 404, not 403: don't confirm the page exists
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow'
    }
  });
}
