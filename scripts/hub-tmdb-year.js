const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TMDB_BASE = 'https://api.themoviedb.org/3';

async function tmdbFetch(path) {
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${separator}api_key=${TMDB_KEY}&language=en-US`);
  if (!res.ok) return null;
  return res.json();
}

async function getYear(imdbId) {
  const search = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
  if (!search) return null;
  const item = search.movie_results?.[0] || search.tv_results?.[0];
  if (!item) return null;
  const dateStr = item.release_date || item.first_air_date;
  return dateStr ? parseInt(dateStr.slice(0, 4)) : null;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('=== hub-tmdb-year.js başlıyor ===');
  let page = 0;
  const pageSize = 50;

  while (true) {
    const { data, error } = await supabase
      .from('hub_contents')
      .select('id, imdb_id')
      .is('year', null)
      .not('imdb_id', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) { console.log('Tamamlandı.'); break; }

    console.log(`Sayfa ${page + 1}: ${data.length} içerik`);

    for (const item of data) {
      try {
        const year = await getYear(item.imdb_id);
        if (year) {
          await supabase.from('hub_contents').update({ year }).eq('id', item.id);
          console.log(`  OK: ${item.imdb_id} → ${year}`);
        } else {
          console.log(`  Atlandı: ${item.imdb_id}`);
        }
      } catch (e) {
        console.error(`  Hata: ${item.imdb_id}`, e.message);
      }
      await sleep(250);
    }
    page++;
  }
  console.log('=== Bitti ===');
}

run().catch(console.error);
