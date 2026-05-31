const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLATFORMS = [
  { slug: 'netflix', catalog: 'netflix' },
  { slug: 'amazon',  catalog: 'prime'   },
  { slug: 'disney',  catalog: 'disney'  },
  { slug: 'hbo',     catalog: 'hbo'     },
];

// Get Unix timestamp for 48 hours ago (buffer for timezone differences)
const since = Math.floor(Date.now() / 1000) - (48 * 60 * 60);

async function fetchNewContent(platform) {
  let allItems = [];
  let hasMore = true;
  let cursor = null;

  while (hasMore) {
    const params = new URLSearchParams({
      country: 'tr',
      catalogs: platform.catalog,
      orderBy: 'availableSince',
      orderDirection: 'desc',
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

    if (!res.ok) { console.error(`RapidAPI error ${platform.slug}: ${res.status}`); break; }

    const data = await res.json();
    const shows = data.shows || [];

    // Filter only shows added in last 48h
    const newShows = shows.filter(show => {
      const options = show.streamingOptions?.tr || [];
      const match = options.find(o => o.service?.id === (platform.slug === 'amazon' ? 'prime' : platform.slug));
      return match?.availableSince && match.availableSince >= since;
    });

    allItems = allItems.concat(newShows);
    console.log(`  ${platform.slug}: ${newShows.length} yeni içerik bulundu`);

    // Stop if we've passed the time window
    if (newShows.length < shows.length) break;

    hasMore = data.hasMore || false;
    cursor = data.nextCursor || null;
    if (!hasMore) break;
    await sleep(1000);
  }

  return allItems;
}

function getStreamingInfo(show, platformSlug) {
  const serviceId = platformSlug === 'amazon' ? 'prime' : platformSlug;
  const options = show.streamingOptions?.tr || [];
  const match = options.find(o => o.service?.id === serviceId);
  if (!match) return { url: null, available_since: null };
  return {
    url: match.link || null,
    available_since: match.availableSince
      ? new Date(match.availableSince * 1000).toISOString().split('T')[0]
      : null,
  };
}

async function processNewItems(items, platform) {
  if (items.length === 0) return;

  const validItems = items.filter(s => s.imdbId);
  const seen = new Set();
  const uniqueItems = validItems.filter(s => {
    if (seen.has(s.imdbId)) return false;
    seen.add(s.imdbId);
    return true;
  });

  const showsData = uniqueItems.map(show => ({
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
  }));

  // Upsert contents
  const { data, error } = await supabase
    .from('hub_contents')
    .upsert(showsData, { onConflict: 'imdb_id', ignoreDuplicates: false })
    .select('id, imdb_id');
  if (error) { console.error('Upsert error:', error.message); return; }

  const contentIdMap = {};
  (data || []).forEach(row => { contentIdMap[row.imdb_id] = row.id; });

  // Upsert availabilities with real available_since
  const availabilities = uniqueItems.map(show => {
    const contentId = contentIdMap[show.imdbId];
    if (!contentId) return null;
    const { url, available_since } = getStreamingInfo(show, platform.slug);
    return {
      content_id: contentId,
      platform_slug: platform.slug,
      platform_url: url,
      available_since: available_since || new Date().toISOString().split('T')[0],
    };
  }).filter(Boolean);

  const { error: avErr } = await supabase
    .from('hub_availability')
    .upsert(availabilities, { onConflict: 'content_id,platform_slug' });
  if (avErr) console.error('Availability error:', avErr.message);

  console.log(`  ${platform.slug}: ${uniqueItems.length} yeni içerik eklendi/güncellendi`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('=== hub-new.js başlıyor ===');
  console.log(`Son 48 saat: ${new Date(since * 1000).toISOString()}`);

  for (const platform of PLATFORMS) {
    console.log(`\n[${platform.slug}] yeni içerikler çekiliyor...`);
    try {
      const items = await fetchNewContent(platform);
      await processNewItems(items, platform);
    } catch (err) {
      console.error(`[${platform.slug}] hata:`, err.message);
    }
    await sleep(2000);
  }

  console.log('\n=== hub-new.js tamamlandı ===');
}

run().catch(console.error);
