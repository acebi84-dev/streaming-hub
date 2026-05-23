const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TMDB_BASE = 'https://api.themoviedb.org/3';

async function tmdbFetch(path, lang = 'en-US') {
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${separator}api_key=${TMDB_KEY}&language=${lang}`);
  if (!res.ok) return null;
  return res.json();
}

async function enrichContent(content) {
  const search = await tmdbFetch(`/find/${content.imdb_id}?external_source=imdb_id`);
  if (!search) return null;

  const isMovie = search.movie_results?.length > 0;
  const isTv = search.tv_results?.length > 0;

  if (!isMovie && !isTv) return null;

  const type = isMovie ? 'movie' : 'tv';
  const item = isMovie ? search.movie_results[0] : search.tv_results[0];

  // Fetch English details
  const detailEn = await tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`);
  if (!detailEn) return null;

  // Fetch Turkish details for localized fields
  const detailTr = await tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`, 'tr-TR');

  // Director (movies only)
  const director = isMovie
    ? (detailEn.credits?.crew?.find(c => c.job === 'Director')?.name || null)
    : null;

  // Cast (top 5)
  const cast = detailEn.credits?.cast?.slice(0, 5).map(c => c.name).join(', ') || null;

  // Trailer
  const trailer = detailEn.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')
    || detailTr?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
  const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;

  // Turkish title - use TR if available, fallback to EN
  const titleTr = (detailTr?.title || detailTr?.name) || (detailEn.title || detailEn.name) || null;

  // Synopsis TR - use TR if available and not empty, fallback to EN
  const synopsisTr = (detailTr?.overview && detailTr.overview.trim() !== '')
    ? detailTr.overview
    : (detailEn.overview || null);

  // Synopsis EN
  const synopsis = detailEn.overview || null;

  // Tagline
  const tagline = (detailEn.tagline && detailEn.tagline.trim() !== '') ? detailEn.tagline : null;

  // Runtime
  const runtime = detailEn.runtime || detailEn.episode_run_time?.[0] || null;
  const original_language = detailEn.original_language || null;
  const year = detailEn.release_date?.slice(0,4) ? parseInt(detailEn.release_date.slice(0,4)) : (detailEn.first_air_date?.slice(0,4) ? parseInt(detailEn.first_air_date.slice(0,4)) : null);

  return {
    title_tr: titleTr,
    synopsis_tr: synopsisTr,
    synopsis,
    tagline,
    director,
    cast_list: cast,
    trailer_url: trailerUrl,
    runtime,
    original_language,
    year,
  };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== hub-tmdb.js başlıyor ===');

  // Process contents where any key field is missing
  let page = 0;
  const pageSize = 50;

  while (true) {
    const { data: contents, error } = await supabase
      .from('hub_contents')
      .select('id, imdb_id, type')
      .or('cast_list.is.null,synopsis_tr.is.null,synopsis.is.null,trailer_url.is.null,year.is.null,original_language.is.null,title_tr.is.null,director.is.null,runtime.is.null,tagline.is.null')
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

    // Enrich all contents in parallel batches of 5
    const PARALLEL = 5;
    const updates = [];
    const skipped = [];

    for (let i = 0; i < contents.length; i += PARALLEL) {
      const batch = contents.slice(i, i + PARALLEL);
      const results = await Promise.all(batch.map(async (content) => {
        try {
          const enriched = await enrichContent(content);
          if (!enriched) return { skip: content.id };
          return { id: content.id, ...enriched };
        } catch (err) {
          console.error(`  Hata ${content.imdb_id}:`, err.message);
          return null;
        }
      }));

      for (const result of results) {
        if (!result) continue;
        if (result.skip) { skipped.push(result.skip); continue; }
        updates.push(result);
      }
      await sleep(300);
    }

    // Batch update enriched contents
    if (updates.length > 0) {
      const { error: upsertError } = await supabase
        .from('hub_contents')
        .upsert(updates, { onConflict: 'id' });
      if (upsertError) console.error('Batch update error:', upsertError.message);
      else console.log(`  ${updates.length} kayıt güncellendi`);
    }

    // Mark skipped as processed
    for (const id of skipped) {
      await supabase.from('hub_contents').update({ synopsis_tr: '', cast_list: '' }).eq('id', id).is('synopsis_tr', null);
    }

    page++;
  }

  console.log('=== hub-tmdb.js tamamlandı ===');
}

run().catch(console.error);
