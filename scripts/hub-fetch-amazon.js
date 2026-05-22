const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAmazonTR() {
  let allItems = [];
  let hasMore = true;
  let cursor = null;

  while (hasMore) {
    const params = new URLSearchParams({
      country: 'tr',
      catalogs: 'prime',
      orderBy: 'title',
      orderDirection: 'asc',
      showType: 'all',
    });
    if (cursor) params.append('cursor', cursor);

    const res = await fetch(
      `https://streaming-availability.p.rapidapi.com/shows/search/filters?${params}`,
      {
        headers: {
          'x-rapidapi-host': 'streaming-availability.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY,
        },
      }
    );

    if (!res.ok) {
      console.error(`RapidAPI error: ${res.status}`);
      break;
    }

    const data = await res.json();
    const shows = data.shows || [];
    allItems = allItems.concat(shows);
    console.log(`amazon: ${allItems.length} items fetched...`);

    hasMore = data.hasMore || false;
    cursor = data.nextCursor || null;
    if (!hasMore) break;

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`Toplam ${allItems.length} içerik bulundu, Supabase'e yazılıyor...`);
  let count = 0;

  for (const show of allItems) {
    if (!show.imdbId) continue;

    const showData = {
      title: show.title || null,
      type: show.showType === 'movie' ? 'movie' : 'series',
      year: show.releaseYear || null,
      imdb_id: show.imdbId || null,
      imdb_score: show.rating ? parseFloat((show.rating / 10).toFixed(1)) : null,
      original_title: show.originalTitle || show.title || null,
      original_language: show.originalLanguage || null,
      poster_url: show.imageSet?.verticalPoster?.w480 || null,
      synopsis: show.overview || null,
      runtime: show.runtime || null,
      genre: show.genres?.map(g => g.name).join(', ') || null,
    };

    const { data: content, error } = await supabase
      .from('hub_contents')
      .upsert(showData, { onConflict: 'imdb_id' })
      .select('id')
      .single();

    if (error || !content) continue;

    const options = show.streamingOptions?.tr || [];
    const match = options.find(o => o.service?.id === 'prime');
    const platformUrl = match?.link || null;

    await supabase.from('hub_availability').upsert(
      { content_id: content.id, platform_slug: 'amazon', platform_url: platformUrl, available_since: new Date().toISOString().split('T')[0] },
      { onConflict: 'content_id,platform_slug' }
    );

    count++;
  }

  console.log(`Tamamlandı! ${count} kayıt eklendi/güncellendi.`);
}

fetchAmazonTR().catch(console.error);
