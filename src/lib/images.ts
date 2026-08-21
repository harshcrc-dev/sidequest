// Curated Unsplash imagery. Sized + compressed at the CDN for performance.
// A gracefully-degrading <Img> component handles any that fail to load.

const U = (id: string, w = 900) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

export const IMG = {
  // City places (Bangalore day)
  breakfast: U("1495474472287-4d71bcdd2085"),
  park: U("1441974231531-c6227db76b6e"),
  market: U("1488459716781-31db52582fe9"),
  lunch: U("1567188040759-fb8a883dc6d8"),
  gallery: U("1541961017774-22349e4a1262"),
  pottery: U("1565193566173-7a0ee3dbe261"),
  coffee: U("1461023058943-07fcbe16d735"),
  sunset: U("1470252649378-9c29740c9fa8"),
  dinner: U("1517248135467-4c7edcad34c4"),
  music: U("1493225457124-a3eb161ffa5f"),
  rooftop: U("1566417713940-fe7c737a9ef2"),
  bakery: U("1509440159596-0249088772ff"),
  brewery: U("1436076863939-06870fe779c2"),
  temple: U("1621996346565-e3dbc646d9a9"),
  bookstore: U("1507842217343-583bb7270b66"),
  lake: U("1439066615861-d1af74d74000"),
  streetfood: U("1533777857889-4be7c70b33f7"),
  cycling: U("1485965120184-e220f721d03e"),

  // Recommendation hero images
  recCity: U("1596176530529-78163a4f7af2", 1400),
  recFood: U("1504674900247-0877df9cc836", 1400),
  recWild: U("1533105079780-92b9be482077", 1400),

  // Nearby escapes
  nandi: U("1506905925346-21bda4d32df4", 1200),
  coorg: U("1598324789736-4861f89564a0", 1200),
  skandagiri: U("1464822759023-fed622ff2c3b", 1200),
  savandurga: U("1454496522488-7a8e488e8606", 1200),
  mysuru: U("1524492412937-b28074a5d7da", 1200),
  shivanasamudra: U("1432405972618-c60b0225b8f9", 1200),

  // Long-trip destinations
  gokarna: U("1507525428034-b723cf961d3e", 1200),
  varkala: U("1512343879784-a960bf40e7f2", 1200),
  hampi: U("1477587458883-47145ed94245", 1200),
  pondicherry: U("1558431382-27e303142255", 1200),
  wayanad: U("1544620347-c4fd4a3d5957", 1200),
  munnar: U("1605649487212-47bdab064df7", 1200),
  goa: U("1519046904884-53103b34b206", 1200),
  andaman: U("1439066615861-d1af74d74000", 1200),

  // Explore cards
  reset: U("1519681393784-d120267933ba", 800),
  new: U("1533105079780-92b9be482077", 800),
  food: U("1504674900247-0877df9cc836", 800),
  date: U("1522075469751-3a6694fb2f61", 800),
  gang: U("1529156069898-49953e39b3ac", 800),
  tourist: U("1524492412937-b28074a5d7da", 800),
  cityQuest: U("1488646953014-85cb44e25828", 800),
  dateQuest: U("1518199266791-5375a83190b7", 800),
  dateMarket: U("1516589178581-6cd7833ae3b2", 800),
  artQuest: U("1549490349-8643362247b5", 800),
  museumQuest: U("1564399579883-451a5d44ec08", 800),
  eventQuest: U("1501281668745-f7f57925c3b4", 800),
  adventureQuest: U("1528360983277-13d401cdc186", 800),
  placeFallback: U("1500534623283-312aade485b7", 900),

  // Hero background
  hero: U("1470770841072-f978cf4d019e", 1600),
} as const;

export type ImgKey = keyof typeof IMG;
