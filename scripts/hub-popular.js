const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.HUB_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.HUB_SUPABASE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || process.env.HUB_RAPIDAPI_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLATFORMS = [
  { slug: 'amazon', rapidId: 'prime' },
  { slug: 'netflix', rapidId: 'netflix' },
  { slug: 'disney', rapidId: 'disney' },
  { slug: 'hbo', rapidId: 'hbo' },
];

const SHOW_TYPES = ['movie', 'series'];

async function fetchPopular(rapidId, showType) {
  const params = new URLSearchParams({
    country: 'tr',
    catalogs: rapidId,
    order_by: 'popularity_1week',
    order_direction: 'desc',
    show_type: showType,
    series_granularity: 'show',
    output_language: 'en',
  });

  const res = await fetch(`https://streaming-availability.p.rapidapi.com/shows/search/filters?${params}`, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com',
    },
  });

  if (!res.ok) {
    console.error(`Error fetching ${rapidId}/${showType}:`, res.status, await res.text());
    return [];
  }

  const data = await res.json();
  return data.shows || [];
}

async function run() {
  console.log('Fetching popular shows for all platforms...');

  const { error: deleteError } = await supabase.from('hub_popular').delete().neq('id', 0);
  if (deleteError) {
    console.error('Delete error:', deleteError);
    return;
  }

  for (const platform of PLATFORMS) {
    for (const showType of SHOW_TYPES) {
      console.log(`Fetching ${platform.slug} / ${showType}...`);
      const shows = await fetchPopular(platform.rapidId, showType);
      console.log(`  Got ${shows.length} shows`);

      const rows = shows.slice(0, 50).map((show, index) => {
        const trOptions = show.streamingOptions?.tr || [];
        const platformOption = trOptions.find(o => o.service.id === platform.rapidId);

        return {
          platform: platform.slug,
          rank: index + 1,
          show_id: show.id,
          imdb_id: show.imdbId,
          title: show.title,
          show_type: showType,
          genres: (show.genres || []).map(g => g.name),
          rating: show.rating,
          runtime: show.runtime || null,
          release_year: show.releaseYear || show.firstAirYear || null,
          poster_w240: show.imageSet?.verticalPoster?.w240 || null,
          poster_w480: show.imageSet?.verticalPoster?.w480 || null,
          streaming_link: platformOption?.link || trOptions[0]?.link || null,
          updated_at: new Date().toISOString(),
        };
      });

      if (rows.length > 0) {
        const { error } = await supabase.from('hub_popular').insert(rows);
        if (error) {
          console.error(`Insert error for ${platform.slug}/${showType}:`, error);
        } else {
          console.log(`  Saved ${rows.length} rows for ${platform.slug}/${showType}`);
        }
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('Done!');
}

run().catch(console.error);
