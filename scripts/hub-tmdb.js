const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TMDB_BASE = 'https://api.themoviedb.org/3';

async function tmdbFetch(path) {
  const res = await fetch(`${TMDB_BASE}${path}&api_key=${TMDB_KEY}&language=tr-TR`);
  if (!res.ok) return null;
  return res.json();
}

async function tmdbFetchEn(path) {
  const res = await fetch(`${TMDB_BASE}${path}&api_key=${TMDB_KEY}&language=en-US`);
  if (!res.ok) return null;
  return res.json();
}

async function enrichMovie(content) {
  const search = await tmdbFetch(`/find/${content.imdb_id}?external_source=imdb_id`);
  if (!search) return null;

  const item = search.movie_results?.[0] || search.tv_results?.[0];
  if (!item) return null;

  const type = search.movie_results?.length ? 'movie' : 'tv';
  const detail = await tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`);
  if (!detail) return null;

  const detailEn = await tmdbFetchEn(`/${type}/${item.id}?append_to_response=credits,videos`);

  const director = detail.credits?.crew?.find(c => c.job === 'Director')?.name || null;
  const cast = detail.credits?.cast?.slice(0, 5).map(c => c.name).join(', ') || null;
  const trailer = detail.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
  const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;

  return {
    title_tr: detail.title || detail.name || null,
    synopsis_tr: detail.overview || null,
    synopsis: detailEn?.overview || null,
    tagline: detailEn?.tagline || detail.tagline || null,
    director,
    cast_list: cast,
    trailer_url: trailerUrl,
    runtime: detail.runtime || detail.episode_run_time?.[0] || null,
  };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== hub-tmdb.js başlıyor ===');

  let page = 0;
  const pageSize = 50;

  while (true) {
    const { data: contents, error } = await supabase
      .from('hub_contents')
      .select('id, imdb_id, type')
      .is('director', null)
      .not('imdb_id', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Supabase fetch error:', error.message);
      break;
    }

    if (!contents || contents.length === 0) {
      console.log('Tüm içerikler işlendi.');
      break;
    }

    console.log(`Sayfa ${page + 1}: ${contents.length} içerik işleniyor...`);

    for (const content of contents) {
      try {
        const enriched = await enrichMovie(content);
        if (!enriched) {
          console.log(`  Atlandı: ${content.imdb_id}`);
          continue;
        }

        const { error: updateError } = await supabase
          .from('hub_contents')
          .update(enriched)
          .eq('id', content.id);

        if (updateError) {
          console.error(`  Güncelleme hatası ${content.imdb_id}:`, updateError.message);
        } else {
          console.log(`  OK: ${content.imdb_id}`);
        }
      } catch (err) {
        console.error(`  Hata ${content.imdb_id}:`, err.message);
      }

      await sleep(250);
    }

    page++;
  }

  console.log('=== hub-tmdb.js tamamlandı ===');
}

run().catch(console.error);
