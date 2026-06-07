// İzlio — günlük "yeni içerik" push bildirimi.
// Son 24 saatte eklenen içerikleri platform bazında sayar; her token sahibine
// SEÇİLİ platformlarındaki toplama göre kişiselleştirilmiş bildirim gönderir.
// Eşik: kullanıcının platformlarında < 3 yeni içerik varsa GÖNDERME.
// SUPABASE_KEY service role olmalı (push_tokens'ı tüm kullanıcılar için okur).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service role
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const THRESHOLD = 3;
const PLATFORM_NAMES = { netflix: 'Netflix', amazon: 'Prime', disney: 'Disney+', hbo: 'HBO Max', mubi: 'MUBI', crunchyroll: 'Crunchyroll' };

function yesterdayDate() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

async function main() {
  const since = yesterdayDate();
  console.log('=== hub-push-new.js başlıyor === since:', since);

  // 1) Son 24s yeni içerik — platform bazında distinct content sayısı
  const { data: avail, error: e1 } = await supabase
    .from('hub_availability').select('platform_slug, content_id').gte('available_since', since);
  if (e1) { console.error('hub_availability hata:', e1.message); process.exit(1); }
  const perPlatform = {};
  (avail || []).forEach(a => { (perPlatform[a.platform_slug] = perPlatform[a.platform_slug] || new Set()).add(a.content_id); });
  const counts = {};
  Object.keys(perPlatform).forEach(s => { counts[s] = perPlatform[s].size; });
  console.log('Yeni içerik (platform):', counts);
  if (Object.keys(counts).length === 0) { console.log('Yeni içerik yok, çıkılıyor.'); return; }

  // 2) Tüm push token sahipleri (service role -> RLS aşılır)
  const { data: tokens, error: e2 } = await supabase.from('push_tokens').select('user_id, token');
  if (e2) { console.error('push_tokens hata (service role mı?):', e2.message); process.exit(1); }
  if (!tokens || tokens.length === 0) { console.log('Token yok.'); return; }
  const tokensByUser = {};
  tokens.forEach(t => { (tokensByUser[t.user_id] = tokensByUser[t.user_id] || []).push(t.token); });
  const userIds = Object.keys(tokensByUser);
  console.log('Token sahibi kullanıcı:', userIds.length);

  // 3) Profiller — selected_platforms
  const { data: profs } = await supabase.from('profiles').select('id, selected_platforms').in('id', userIds);
  const platByUser = {};
  (profs || []).forEach(p => { platByUser[p.id] = p.selected_platforms || []; });

  // 4) Kullanıcı başına mesaj
  const messages = [];
  let skipped = 0;
  for (const uid of userIds) {
    const userPlatforms = platByUser[uid] || [];
    const hits = userPlatforms
      .map(s => ({ slug: s, count: counts[s] || 0 }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count);
    const total = hits.reduce((a, h) => a + h.count, 0);
    if (total < THRESHOLD) { skipped++; continue; }
    const part = hits.length >= 2
      ? `${PLATFORM_NAMES[hits[0].slug] || hits[0].slug} ve ${PLATFORM_NAMES[hits[1].slug] || hits[1].slug}'a`
      : `${PLATFORM_NAMES[hits[0].slug] || hits[0].slug}'a`;
    const body = `${part} bugün ${total} yeni içerik geldi 🍿`;
    for (const to of tokensByUser[uid]) {
      messages.push({ to, title: 'İzlio', body, sound: 'default', data: { type: 'new_content' } });
    }
  }
  console.log(`Gönderilecek mesaj: ${messages.length} | eşik altı atlanan kullanıcı: ${skipped}`);

  // 5) Expo Push — 100'lük chunk, rate limit'e saygı
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      console.log(`Expo chunk ${Math.floor(i / 100) + 1}: HTTP ${res.status}`);
    } catch (err) { console.error('Expo gönderim hatası:', err.message); }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('=== hub-push-new.js tamamlandı ===');
}

main().catch(e => { console.error(e); process.exit(1); });
