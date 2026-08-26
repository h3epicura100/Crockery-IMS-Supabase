const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.hfvbyktusslocxsblenu:tGHjHzbNBDf4ovr7@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const sheetData = [
  ['100 ml', 768], ['120 ML', 463], ['15- NO', 7], ['150 ml', 682],
  ['24 NO', 0], ['25-NO', 0], ['26-NO', 0], ['27 NO', 300], ['28 NO', 300],
  ['30 No', 0], ['32 NO', 1200], ['33-NO', 500], ['4* plate', 0], ['4* Sqare Bowl', 350],
  ['6* Round Plate', 250], ['6* Square Plate', 500], ['8* Square Plate', 38], ['9 NO', 0],
  ['Aluminium Silver Tag Stand', 0], ['Aster-m', 106], ['ASTER-P', 140], ['B-1', 300],
  ['B-1 big', 7], ['B-2', 275], ['B-3', 72], ['B-4', 229], ['BAMBOO M/ CONE', 0],
  ['Barbecue Tray', 0], ['Barbeque Big Tray', 0], ['Bettery Lamp Big', 0],
  ['Bettery Lamp Medium', 0], ['Bettery Lamp Small', 0], ['Big Boat', 1500],
  ['Big Cone', 0], ['BIG DONA', 0], ['Big Golden Tray', 0], ['Big Gun Toothpick', 400],
  ['Big Handi', 170], ['Big kulhhad', 1500], ['Big Pot Golden', 0],
  ['Black & White Bowl', 0], ['Black Big Bowl', 0], ['Black Candle Stand', 0],
  ['Black Golden BIg bowl', 0], ['Black Horse Lamp', 0], ['Black Lamp', 0],
  ['Black Round Tray', 0], ['Black Small Bowl', 0], ['Black Tray', 0],
  ['Black Wooden Bowl', 0], ['Blue White Flower', 0], ['Bonechina Bowl', 323],
  ['Box Photo Small', 0], ['Charging Lamp', 0], ['Charlie Stand', 0],
  ['Cheese Meeter', 0], ['CHINESE LAMP', 0], ['Chinni Mitti Blue Bowl', 0],
  ['Chinni Mitti Important', 0], ['Chocolate Fountain', 0], ['Chutney Spoon', 0],
  ['Cofee Glass', 0], ['Combo Fork', 0], ['Copper Round Tray', 0], ['Copper Spoon', 0],
  ['Copper Tray', 0], ['CS-021 AD', 0], ['CS-04', 306], ['CS-047', 24], ['CS-048', 20],
  ['CS-05', 232], ['CS-13', 143], ['CS-22', 265], ['CS-43', 128], ['CS-44', 458],
  ['CS-45', 266], ['CS0-16 AD', 417], ['CS00-33A  AD', 604], ['CS021 AD', 214],
  ['CSRP-20', 155], ['CSRP-21', 133], ['Cup Lamp', 0], ['Daal Spoon', 0],
  ['Deep Bowl', 0], ['Deep Plater Bowl', 0], ['Dessert Spoon', 2100],
  ['Dinner plate', 300], ['DINNER SPOON', 606], ['Dipp Bowl Black', 0],
  ['Dispenser', 0], ['Dona Pattal', 0], ['Double bhatti Cover', 0],
  ['Elephent Lamp', 0], ['FA-1', 15], ['FA-2', 13], ['FA-3', 13], ['FA-4', 8],
  ['FB-5', 2], ['FB-6', 2], ['FB-7', 1], ['FB-8', 1], ['FL-2', 11], ['FL-4', 11],
  ['fL-6', 13], ['Flate Tong', 0], ['Fruit Fork', 0], ['Fruit Tong', 0],
  ['Gl Big', 263], ['Gl Cup', 172], ['Gl Small', 299], ['GL-2', 176],
  ['Golden Banana Leaf', 0], ['Golden Big Bowl', 0], ['Golden Candle Lamp', 0],
  ['Golden Deep Bowl BIG', 0], ['Golden Jaali 2', 0], ['Golden Kadhai', 0],
  ['Golden Lamp', 0], ['Golden Lamp-2', 0], ['Golden New Small Bowl', 0],
  ['Golden Pot Big', 0], ['Golden Pot-2', 0], ['Golden Silver Servise Tray', 0],
  ['Golden Small Bowl', 0], ['Golden Tissue Stand', 0], ['Golden Tray', 0],
  ['Golden Tray Small', 0], ['Gray Round Tray', 0], ['Green Bowl', 0],
  ['H3 Board', 0], ['H3 Toothpick', 0], ['Induction Cover', 0], ['Iron Glass Brass', 0],
  ['Jhalmuri Tong', 0], ['k-1', 2760], ['K-2', 1896], ['k-3', 9100], ['k-4', 2200],
  ['k-5', 1680], ['k-6', 12600], ['Kansa Pot', 0], ['Laalteen', 0], ['Line Glass', 81],
  ['Loha Bowl', 0], ['M/BOAT', 875], ['MARTINI GLASS', 48], ['MB - D2', 0],
  ['MB-0044', 516], ['MB-0045', 314], ['MB-0048', 0], ['MB-1 GG', 174],
  ['MB-10A GG', 105], ['MB-10B', 558], ['MB-11 GG', 154], ['MB-13', 213],
  ['MB-14 GG', 195], ['MB-21 GG', 112], ['MB-33', 356], ['MB-44', 516],
  ['MB-5 GG', 243], ['MB-8B', 108], ['MB-8D GG', 258], ['MB-9 GG', 480],
  ['MB0047', 26], ['MB0048', 26], ['MBP-29', 9], ['MBP-30', 9], ['MBP-31', 9],
  ['MBP-4', 274], ['MBRP-20', 154], ['MBRP-21', 287], ['Medium Cone', 0],
  ['MONKEY BOWL', 0], ['Name Tag Stand Big', 0], ['Name Tag Stand Small', 0],
  ['Nav Boat', 0], ['New Big Goldeb Square Bowl', 0], ['New Deep Plater Stand Bowl', 0],
  ['New Small Golden Bowl', 0], ['New Small Golden Square Bowl', 0], ['New Tong', 0],
  ['Noodles Tong', 0], ['Old Big Golden Chaat Bowl', 0], ['Old Medium Golden Chaat Bowl', 0],
  ['Old Small Golden Chaat Bowl', 0], ['Old Small Golden Chaat Bowl 2', 0], ['Orange Plate', 77],
  ['PLAIN GLASS', 0], ['PP', 1000], ['Red Bowl', 0], ['Rice Spoon', 0], ['S-1', 114],
  ['Service Bowl', 0], ['Service Spoon', 0], ['Service Spoon-2', 0], ['Service Spoon-3', 0],
  ['Service Spoon-4', 0], ['Service Tong', 0], ['Silver Copper', 0], ['Silver Copper Bowl', 0],
  ['Silver Golden Plater', 0], ['Silver Golden Tray', 0], ['Silver Mug', 0],
  ['Silver Pot Small', 0], ['Silver White Bowl', 0], ['Single Bhatti Corner', 0],
  ['Small Bamboo Boat', 0], ['SMALL CONE', 0], ['Small Gold Silver New Bowl', 0],
  ['Small Golden Poat', 0], ['Small Golden Silver Bowl', 0], ['Small Gun Toothpick', 1750],
  ['Small Round Bulb', 0], ['Small Still Tissue Stand', 0], ['Small Tag Stand', 0],
  ['Small Tong', 0], ['Small toothpick', 0], ['Soup Handi Spoon', 0],
  ['Squar Golden Tray', 0], ['Still Kadhai', 0], ['Still Press Small tag Stand', 0],
  ['Still Tissue Stand', 0], ['Still Tray', 0], ['Stone Bowl', 0], ['Stone Pot', 0],
  ['Straw', 1600], ['TC-1', 190], ['TC-2', 287], ['TC-3', 185], ['TC-4', 200],
  ['TC-5', 179], ['TC-6', 196], ['TC-9', 200], ['TCG-7', 139], ['TCG-8', 43],
  ['Three Tray Rack', 0], ['Toothpick Big', 2500], ['Two Self Rack With Hurts', 0],
  ['Wh-1', 148], ['Wh-2', 134], ['Wh-3', 131], ['Wh-4', 112], ['Wh-5', 270],
  ['White Big Bowl', 0], ['White Wooden Tray Large', 0], ['Wodden Service Tray', 0],
  ['Wooden Bowl', 0], ['Wooden Elephent Small', 0], ['Wooden fork', 5500],
  ['Wooden Four Staper', 0], ['Wooden Hawker Tray Small', 0], ['Wooden Lamp', 0],
  ['Wooden Owl', 0], ['Wooden Rack Root Foolding', 0], ['Wooden Round Riser With Inner', 0],
  ['Wooden Sheep', 0], ['Wooden Spoon', 3850], ['Wooden Tag Stand', 0],
  ['WOODEN TRAY', 0], ['Wooden Tray & Black Stand', 0], ['Wooden Tray Big', 0],
  ['Wooden Trolly', 0], ['Wooden Two Staper Black Stand', 0], ['Wooden Two Stapper', 0],
  ['Wooden Water Stand', 0], ['Wooden White RIser L/M/S', 0], ['Yellow Bowl', 0]
];

const sheetNames = sheetData.map(r => r[0]);

async function run() {
  await client.connect();

  // Get all item_master names
  const res = await client.query('SELECT item_name FROM item_master ORDER BY item_name');
  const dbNames = new Set(res.rows.map(x => x.item_name));

  const notFound = sheetNames.filter(n => !dbNames.has(n));
  const found = sheetNames.filter(n => dbNames.has(n));

  console.log('\n=== MATCHED ITEMS (will be updated): ' + found.length + ' ===');
  console.log('\n=== NOT MATCHED IN DB (case-sensitive): ' + notFound.length + ' ===');
  notFound.forEach(n => console.log('  NOT FOUND: "' + n + '"'));

  // Try case-insensitive match for unmatched
  if (notFound.length > 0) {
    console.log('\n=== CASE-INSENSITIVE SUGGESTIONS ===');
    for (const name of notFound) {
      const r2 = await client.query(
        'SELECT item_name FROM item_master WHERE lower(item_name) = lower($1)',
        [name]
      );
      if (r2.rows.length > 0) {
        console.log('  Sheet: "' + name + '" => DB: "' + r2.rows[0].item_name + '"');
      } else {
        console.log('  Sheet: "' + name + '" => NO MATCH AT ALL');
      }
    }
  }

  await client.end();
}

run().catch(e => { console.error(e.message); client.end(); });
