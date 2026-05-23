const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLATFORMS = [
  { slug: 'netflix', rapidapi_id: 'netflix' },
  { slug: 'amazon',  rapidapi_id: 'prime'   },
  { slug: 'disney',  rapidapi_id: 'disney'  },
  { slug: 'hbo',     rapidapi_id: 'hbo'     },
];

async function fetchPlatformCatalog(platformId) {
  let allItems = [];
  let hasMore = true;
  let cursor = null;

  while (hasMore) {
    const params = new URLSearchParams({
      country: 'tr',
      service: platformId,
      outputLanguage: 'en',
      showType: 'all',
    });
    if (cursor) params.append('cursor', cursor);

    const url = `https://streaming-availability.p.rapidapi.com/shows/search/filters?${params}`;

    const res = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'streaming-availability.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY,
      },
    });

    if (!res.ok) {
      console.error(`RapidAPI error for ${platformId}: ${res.status}`);
      break;
    }

    const data = await res.json();
    const shows = data.shows || [];
    allItems = allItems.concat(shows);

    console.log(`  ${platformId}: ${allItems.length} items fetched...`);

    if (data.hasMore && data.nextCursor) {
      cursor = data.nextCursor;
    } else {
      hasMore = false;
    }

    await sleep(300);
  }

  return allItems;
}

function mapShow(show) {
  return {
    title: show.title || null,
    type: show.showType === 'movie' ? 'movie' : 'series',
    year: show.releaseYear || null,
    imdb_id: show.imdbId || null,
    original_title: show.originalTitle || show.title || null,
    original_language: show.originalLanguage || null,
    poster_url: show.imageSet?.verticalPoster?.w480 || show.imageSet?.horizontalPoster?.w480 || null,
    synopsis: show.overview || null,
    runtime: show.runtime || null,
    genre: show.genres?.map(g => g.name).join(', ') || null,
  };
}

function getStreamingUrl(show, platformId) {
  const streamingInfo = show.streamingInfo?.tr || {};
  const platformData = streamingInfo[platformId];
  if (!platformData || !platformData.length) return null;
  return platformData[0].link || null;
}

async function upsertContent(showData) {
  const { data, error } = await supabase
    .from('hub_contents')
    .upsert(showData, { onConflict: 'imdb_id', ignoreDuplicates: false })
    .select('id')
    .single();

  if (error) {
    console.error('Content upsert error:', error.message, showData.imdb_id);
    return null;
  }
  return data?.id;
}

async function upsertAvailability(contentId, platformSlug, platformUrl) {
  const { error } = await supabase
    .from('hub_availability')
    .upsert(
      {
        content_id: contentId,
        platform_slug: platformSlug,
        platform_url: platformUrl,
        available_since: new Date().toISOString().split('T')[0],
      },
      { onConflict: 'content_id,platform_slug' }
    );

  if (error) {
    console.error('Availability upsert error:', error.message);
  }
}

async function processBatch(items, platformSlug, platformRapidId) {
  for (const show of items) {
    if (!show.imdbId) continue;

    const showData = mapShow(show);
    const contentId = await upsertContent(showData);
    if (!contentId) continue;

    const platformUrl = getStreamingUrl(show, platformRapidId);
    if (platformUrl) await upsertAvailability(contentId, platformSlug, platformUrl);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== hub-fetch.js başlıyor ===');
  console.log(`Tarih: ${new Date().toISOString()}`);

  for (const platform of PLATFORMS) {
    console.log(`\n[${platform.slug}] çekiliyor...`);
    try {
      const items = await fetchPlatformCatalog(platform.rapidapi_id);
      console.log(`[${platform.slug}] toplam ${items.length} içerik bulundu`);
      // Eski availability kayıtlarını sil (delist olanlar için)
      const { error: deleteError } = await supabase
        .from('hub_availability')
        .delete()
        .eq('platform_slug', platform.slug);
      if (deleteError) console.error(`Delete error for ${platform.slug}:`, deleteError.message);
      else console.log(`[${platform.slug}] eski availability silindi`);
      await processBatch(items, platform.slug, platform.rapidapi_id);
      console.log(`[${platform.slug}] tamamlandı`);
    } catch (err) {
      console.error(`[${platform.slug}] hata:`, err.message);
    }

    await sleep(1000);
  }

  console.log('\n=== hub-fetch.js tamamlandı ===');
}

run().catch(console.error);
