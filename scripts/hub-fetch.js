const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLATFORMS = [
  { slug: 'netflix', catalog: 'netflix'     },
  { slug: 'amazon',  catalog: 'prime' },
  { slug: 'disney',  catalog: 'disney'      },
  { slug: 'hbo',     catalog: 'hbo'         },
];

async function fetchPlatformCatalog(platform) {
  let allItems = [];
  let hasMore = true;
  let cursor = null;

  while (hasMore) {
    const params = new URLSearchParams({
      country: 'tr',
      catalogs: platform.catalog,
      orderBy: 'title',
      orderDirection: 'asc',
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
      console.error(`RapidAPI error for ${platform.slug}: ${res.status}`);
      break;
    }

    const data = await res.json();
    const shows = data.shows || [];
    allItems = allItems.concat(shows);

    console.log(`  ${platform.slug}: ${allItems.length} items fetched...`);

    hasMore = data.hasMore || false;
    cursor = data.nextCursor || null;

    if (!hasMore) break;

    await sleep(1500);
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

function getStreamingUrl(show, platformSlug) {
  const serviceId = platformSlug === 'amazon' ? 'prime' : platformSlug;
  const options = show.streamingOptions?.tr || [];
  const match = options.find(o => o.service?.id === serviceId);
  return match?.link || null;
}



async function processBatch(items, platform) {
  const BATCH_SIZE = 100;

  // Prepare all content data
  const validItems = items.filter(show => show.imdbId);
  const showsData = validItems.map(mapShow);

  // Upsert contents in batches
  const contentIdMap = {};
  for (let i = 0; i < showsData.length; i += BATCH_SIZE) {
    const batch = showsData.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('hub_contents')
      .upsert(batch, { onConflict: 'imdb_id', ignoreDuplicates: false })
      .select('id, imdb_id');
    if (error) { console.error('Batch upsert error:', error.message); continue; }
    (data || []).forEach(row => { contentIdMap[row.imdb_id] = row.id; });
    console.log(`  ${platform.slug}: ${Math.min(i + BATCH_SIZE, showsData.length)}/${showsData.length} içerik yazıldı`);
  }

  // Prepare availability data
  const availabilities = validItems
    .map(show => {
      const contentId = contentIdMap[show.imdbId];
      if (!contentId) return null;
      return {
        content_id: contentId,
        platform_slug: platform.slug,
        platform_url: getStreamingUrl(show, platform.slug),
        available_since: new Date().toISOString().split('T')[0],
      };
    })
    .filter(Boolean);

  // Upsert availabilities in batches
  for (let i = 0; i < availabilities.length; i += BATCH_SIZE) {
    const batch = availabilities.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('hub_availability')
      .upsert(batch, { onConflict: 'content_id,platform_slug' });
    if (error) console.error('Availability batch error:', error.message);
  }

  console.log(`  ${platform.slug}: ${availabilities.length} availability yazıldı`);
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
      const items = await fetchPlatformCatalog(platform);
      console.log(`[${platform.slug}] toplam ${items.length} içerik bulundu`);
      const { error: deleteError } = await supabase.from('hub_availability').delete().eq('platform_slug', platform.slug);
      if (deleteError) console.error(`Delete error for ${platform.slug}:`, deleteError.message);
      else console.log(`[${platform.slug}] eski availability silindi`);
      await processBatch(items, platform);
      console.log(`[${platform.slug}] tamamlandı`);
    } catch (err) {
      console.error(`[${platform.slug}] hata:`, err.message);
    }
    await sleep(5000);
  }

  console.log('\n=== hub-fetch.js tamamlandı ===');
}

run().catch(console.error);
