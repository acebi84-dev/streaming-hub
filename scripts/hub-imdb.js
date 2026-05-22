const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const IMDB_RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';

async function downloadAndParseRatings() {
  return new Promise((resolve, reject) => {
    const ratings = new Map();

    https.get(IMDB_RATINGS_URL, (res) => {
      const gunzip = zlib.createGunzip();
      const rl = readline.createInterface({ input: res.pipe(gunzip) });
      let first = true;

      rl.on('line', (line) => {
        if (first) { first = false; return; }
        const [tconst, averageRating, numVotes] = line.split('\t');
        if (tconst && averageRating && numVotes) {
          ratings.set(tconst, {
            score: parseFloat(averageRating),
            votes: parseInt(numVotes, 10),
          });
        }
      });

      rl.on('close', () => resolve(ratings));
      rl.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function run() {
  console.log('=== hub-imdb.js başlıyor ===');
  console.log('IMDB ratings dataset indiriliyor...');

  const ratings = await downloadAndParseRatings();
  console.log(`${ratings.size} IMDB kaydı yüklendi`);

  let page = 0;
  const pageSize = 500;
  let totalUpdated = 0;

  while (true) {
    const { data: contents, error } = await supabase
      .from('hub_contents')
      .select('id, imdb_id')
      .not('imdb_id', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Supabase fetch error:', error.message);
      break;
    }

    if (!contents || contents.length === 0) break;

    const updates = contents
      .filter(c => ratings.has(c.imdb_id))
      .map(c => ({
        id: c.id,
        imdb_score: ratings.get(c.imdb_id).score,
        imdb_votes: ratings.get(c.imdb_id).votes,
        updated_at: new Date().toISOString(),
      }));

    if (updates.length > 0) {
      const { error: upsertError } = await supabase
        .from('hub_contents')
        .upsert(updates, { onConflict: 'id' });

      if (upsertError) {
        console.error('Toplu güncelleme hatası:', upsertError.message);
      } else {
        totalUpdated += updates.length;
        console.log(`Sayfa ${page + 1}: ${updates.length} güncellendi (toplam: ${totalUpdated})`);
      }
    }

    page++;
  }

  console.log(`\n=== hub-imdb.js tamamlandı — ${totalUpdated} kayıt güncellendi ===`);
}

run().catch(console.error);
