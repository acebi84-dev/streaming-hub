const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('=== hub-collections.js başlıyor ===');
  console.log(`Tarih: ${new Date().toISOString()}`);

  // Tüm koleksiyonları getir
  const { data: collections, error: colError } = await supabase
    .from('hub_collections')
    .select('id');

  if (colError) {
    console.error('Collections fetch error:', colError.message);
    return;
  }

  console.log(`${collections.length} koleksiyon bulundu`);

  let updated = 0;

  for (const col of collections) {
    // Koleksiyondaki tüm itemları güncel hub_contents skorlarıyla getir
    const { data: items, error: itemsError } = await supabase
      .from('hub_collection_items')
      .select('id, content:hub_contents(imdb_score, imdb_votes)')
      .eq('collection_id', col.id);

    if (itemsError) {
      console.error(`Collection ${col.id} items error:`, itemsError.message);
      continue;
    }

    if (!items || items.length === 0) continue;

    // Her itemın imdb_score'unu hub_contents'tan güncelle
    for (const item of items) {
      if (item.content?.imdb_score == null) continue;
      await supabase
        .from('hub_collection_items')
        .update({ imdb_score: item.content.imdb_score })
        .eq('id', item.id);
    }

    // Koleksiyon ortalamalarını hesapla
    const scored = items.filter(i => i.content?.imdb_score != null);
    if (scored.length === 0) continue;

    const avgScore = scored.reduce((s, i) => s + i.content.imdb_score, 0) / scored.length;
    const votedItems = scored.filter(i => i.content?.imdb_votes);
    const avgVotes = votedItems.length > 0
      ? votedItems.reduce((s, i) => s + i.content.imdb_votes, 0) / votedItems.length
      : 0;

    const { error: updateError } = await supabase
      .from('hub_collections')
      .update({
        avg_imdb_score: Math.round(avgScore * 10) / 10,
        avg_votes: Math.round(avgVotes),
      })
      .eq('id', col.id);

    if (updateError) {
      console.error(`Collection ${col.id} update error:`, updateError.message);
    } else {
      console.log(`  Koleksiyon ${col.id}: avg_score=${(Math.round(avgScore * 10) / 10).toFixed(1)}, avg_votes=${Math.round(avgVotes).toLocaleString()}`);
      updated++;
    }
  }

  console.log(`\n=== hub-collections.js tamamlandı — ${updated}/${collections.length} koleksiyon güncellendi ===`);
}

run().catch(console.error);
