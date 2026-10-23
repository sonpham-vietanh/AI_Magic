// Chỉ dùng cho DEV: in ra một token phiên (cookie va_session) để xem giao diện ở trạng thái đã đăng nhập.
// Cách dùng: node scripts/dev-session.mjs "Cô Lan" co.lan@truongvietanh.com teacher|reviewer|admin
// Trong browser-automation: page.context().addCookies([{ name: 'va_session', value: TOKEN, url: 'http://localhost:3092' }])
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const env = {};
try {
  for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {}
const secret = process.env.SESSION_SECRET || env.SESSION_SECRET || env.REVIEWER_KEY || env.SUPABASE_SECRET_KEY || 'va-teaching-studio-local-secret-key';
const [name = 'Cô Lan', email = 'co.lan@truongvietanh.com', role = 'teacher'] = process.argv.slice(2);
const now = Date.now();
const session = { name, email, role, via: 'google', iat: now, exp: now + 14 * 864e5 };
const enc = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
const sig = createHmac('sha256', secret).update(`session.${enc}`).digest('base64url');
process.stdout.write(`${enc}.${sig}\n`);
