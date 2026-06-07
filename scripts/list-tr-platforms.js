const RAPIDAPI_KEY = process.argv[2] || process.env.RAPIDAPI_KEY;
if (!RAPIDAPI_KEY) { console.error('Usage: node list-tr-platforms.js <RAPIDAPI_KEY>'); process.exit(1); }

fetch('https://streaming-availability.p.rapidapi.com/countries/tr', {
  headers: {
    'x-rapidapi-host': 'streaming-availability.p.rapidapi.com',
    'x-rapidapi-key': RAPIDAPI_KEY,
  },
})
  .then(r => r.json())
  .then(data => {
    const services = data.services || {};
    console.log('\n=== TR Desteklenen Platformlar ===\n');
    Object.entries(services).forEach(([id, info]) => {
      console.log(`${id.padEnd(30)} ${info.name}`);
    });
    console.log(`\nToplam: ${Object.keys(services).length} platform`);
  })
  .catch(e => console.error('Hata:', e.message));
