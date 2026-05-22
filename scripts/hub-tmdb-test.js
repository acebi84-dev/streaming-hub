const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TMDB_KEY = process.env.TMDB_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TMDB_BASE = 'https://api.themoviedb.org/3';

// TEST - sadece bu imdb_id işlenecek
const TEST_IMDB = 'tt0903747'; // Breaking Bad

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

  const detailEn = await tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`);
  if (!detailEn) return null;

  const detailTr = await tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`, 'tr-TR');

  const director = isMovie
    ? (detailEn.credits?.crew?.find(c => c.job === 'Director')?.name || null)
    : null;

  const cast = detailEn.credits?.cast?.slice(0, 5).map(c => c.name).join(', ') || null;

  const trailer = detailEn.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')
    || detailTr?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
  const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;

  const titleTr = (detailTr?.title || detailTr?.name) || (detailEn.title || detailEn.name) || null;

  const synopsisTr = (detailTr?.overview && detailTr.overview.trim() !== '')
    ? detailTr.overview
    : (detailEn.overview || null);

  const synopsis = detailEn.overview || null;
  const tagline = (detailEn.tagline && detailEn.tagline.trim() !== '') ? detailEn.tagline : null;
  const runtime = detailEn.runtime || detailEn.episode_run_time?.[0] || null;

  return { title_tr: titleTr, synopsis_tr: synopsisTr, synopsis, tagline, director, cast_list: cast, trailer_url: trailerUrl, runtime };
}

async function run() {
  console.log(`=== TEST: ${TEST_IMDB} ===`);

  const { data, error } = await supabase
    .from('hub_contents')
    .select('id, imdb_id, type, title')
    .eq('imdb_id', TEST_IMDB)
    .limit(1)
    .single();

  if (error || !data) {
    console.error('Kayıt bulunamadı:', error?.message);
    return;
  }

  console.log(`İşleniyor: ${data.title} (${data.imdb_id})`);

  const enriched = await enrichContent(data);
  if (!enriched) {
    console.log('TMDB verisi bulunamadı!');
    return;
  }

  console.log('\n--- Gelen Veri ---');
  console.log(JSON.stringify(enriched, null, 2));

  const { error: updateError } = await supabase
    .from('hub_contents')
    .update(enriched)
    .eq('id', data.id);

  if (updateError) {
    console.error('Güncelleme hatası:', updateError.message);
  } else {
    console.log('\n✓ Supabase güncellendi!');
  }
}

run().catch(console.error);
