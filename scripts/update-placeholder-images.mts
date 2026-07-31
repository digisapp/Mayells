/**
 * Replaces the placeholder catalog's stock imagery with openly-licensed,
 * subject-matched images (Met/Cleveland CC0, Wikimedia Commons CC BY/BY-SA),
 * self-hosted under /public/images. Where the best available image is close
 * but not exactly what the fabricated title claimed, the title is adjusted so
 * the catalog never shows an image contradicting its own description.
 *
 * Idempotent: matches lots by current OR already-updated title.
 * Attribution for CC BY / BY-SA images: public/images/credits.json
 *
 * Usage: DATABASE_URL=... npx tsx scripts/update-placeholder-images.mts
 */
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// [current title, new image path, optional new title]
const LOTS: Array<[string, string, string?]> = [
  ['Continental School: Figure Study in Blue', '/images/lots/continental-figure-study.webp'],
  ['Venetian Glass Chandelier', '/images/lots/venetian-chandelier.webp'],
  ['Ceylon Sapphire and Diamond Ring', '/images/lots/sapphire-ring.webp'],
  ['Art Deco Diamond Tennis Bracelet', '/images/lots/tennis-bracelet.webp', 'Antique Emerald and Diamond Line Bracelet'],
  ['Abstract Landscape: Pacific Coast', '/images/lots/abstract-landscape-pacific.webp', 'Coastal Landscape with Clouds'],
  ['Natural Fancy Vivid Yellow Diamond Ring', '/images/lots/yellow-diamond-ring.webp', 'Yellow Diamond and Gold Ring'],
  ['Water Lilies Study', '/images/lots/water-lilies-study.webp'],
  ['Femme au Chapeau Rouge', '/images/lots/femme-au-chapeau-rouge.webp'],
  ['Untitled (Red Series No. 7)', '/images/lots/untitled-red-series.webp'],
  ['George III Silver Epergne', '/images/lots/george-iii-epergne.webp'],
  ['Meissen Porcelain Swan Service Tureen', '/images/lots/meissen-tureen.webp', 'Meissen Porcelain Tureen and Cover'],
  ['Patek Philippe Ref. 5711/1A Nautilus', '/images/lots/patek-nautilus.webp'],
  ['Rolex Daytona Ref. 6263 "Paul Newman"', '/images/lots/rolex-daytona.webp'],
  ['Audemars Piguet Royal Oak Perpetual Calendar', '/images/lots/ap-royal-oak.webp', 'Audemars Piguet Royal Oak'],
  ['Hermès Birkin 30 Himalaya Niloticus Crocodile', '/images/lots/birkin-himalaya.webp', 'Hermès Birkin 30 Rouge Crocodile'],
  ['Bulgari Serpenti Necklace', '/images/lots/serpenti.webp', 'Bulgari Serpenti Bracelet-Watch'],
  ['Louis XV Ormolu-Mounted Kingwood Commode', '/images/lots/louis-xv-commode.webp', 'Ormolu-Mounted Marquetry Commode'],
  ['Charlotte Perriand "Bibliothèque" Bookcase', '/images/lots/perriand-bookcase.webp'],
  ['George Nakashima "Conoid" Bench', '/images/lots/nakashima-bench.webp', 'George Nakashima "Conoid" Chair'],
  ['Poul Henningsen PH Artichoke Pendant', '/images/lots/ph-artichoke.webp'],
  ['Ettore Sottsass "Carlton" Room Divider', '/images/lots/sottsass-carlton.webp'],
  ['Coastal Landscape: Morning Tide', '/images/lots/coastal-morning-tide.webp'],
  ['Hermès Kelly 28 Sellier Ostrich', '/images/lots/kelly-ostrich.webp'],
  ['Composition in Blue and Gold', '/images/lots/composition-blue-gold.webp'],
  ['Bronze Figure: The Dancer', '/images/lots/bronze-dancer.webp'],
  ['Neon Skyline: Miami After Dark', '/images/lots/neon-miami.webp'],
  ['Still Life with Anemones and Lemons', '/images/lots/still-life-anemones.webp', 'Still Life with Flowers and Fruit'],
  ['Art Deco Diamond and Platinum Bracelet', '/images/lots/deco-platinum-bracelet.webp'],
  ['Van Cleef & Arpels Alhambra Necklace', '/images/lots/vca-alhambra.webp'],
  ['Colombian Emerald and Diamond Pendant', '/images/lots/emerald-pendant.webp'],
  ['Chanel Haute Couture Evening Gown', '/images/lots/chanel-gown.webp', 'Haute Couture Evening Gown'],
  ['Vintage Yves Saint Laurent Le Smoking Tuxedo', '/images/lots/ysl-tuxedo.webp'],
  ['Tiffany & Co. Schlumberger Bracelet', '/images/lots/schlumberger-bracelet.webp', 'Antique Gold, Pearl and Sapphire Bracelet'],
  ['Jardin de Luxembourg, Autumn', '/images/lots/jardin-luxembourg.webp', 'Garden Scene with Figures'],
  ['Pair of Mid-Century Brass Table Lamps', '/images/lots/brass-lamps.webp', 'Mid-Century Tripod Table Lamp'],
  ['Cartier Tank Française Watch', '/images/lots/cartier-tank.webp', 'Cartier Tank Watch'],
  ['Vintage Chanel Classic Flap Bag', '/images/lots/chanel-flap.webp'],
  ['The Scholar in His Study', '/images/lots/scholar-in-study.webp'],
  ['Vintage Hermès Silk Scarf', '/images/lots/hermes-scarf.webp'],
  ['Signed Contemporary Lithograph', '/images/lots/signed-lithograph.webp', 'Belle Époque Lithograph Poster'],
  ['Art Deco Silver Cocktail Shaker', '/images/lots/cocktail-shaker.webp', 'Antique Engraved Silver Caster'],
  ['Antique Leather-Bound Library Set', '/images/lots/library-set.webp'],
  ['Vintage Lalique Crystal Bowl', '/images/lots/lalique-bowl.webp', 'Collection of Art Glass Bowls'],
  // kept as-is: 2017 Ferrari 488 GTB, Hermès Constance 24 Epsom
];

const AUCTIONS: Array<[string, string]> = [
  ['20th Century Design: Icons of Modernism', '/images/auctions/design.webp'],
  ['Modern & Contemporary Art', '/images/auctions/modern-art.webp'],
  ['Important Jewels: The Palm Beach Sale', '/images/auctions/jewels.webp'],
  ['Fine Antiques & European Decorative Arts', '/images/auctions/antiques.webp'],
  ['Haute Couture & Vintage Fashion', '/images/auctions/couture.webp'],
  // kept as-is: Luxury Watches & Accessories
];

let updated = 0, missed: string[] = [];
for (const [title, image, newTitle] of LOTS) {
  const res = newTitle
    ? await sql`update lots set primary_image_url = ${image}, title = ${newTitle}
                where title in (${title}, ${newTitle})`
    : await sql`update lots set primary_image_url = ${image} where title = ${title}`;
  if (res.count === 0) missed.push(title);
  updated += res.count;
}
for (const [title, image] of AUCTIONS) {
  const res = await sql`update auctions set cover_image_url = ${image} where title = ${title}`;
  if (res.count === 0) missed.push(`auction: ${title}`);
  updated += res.count;
}
console.log(`updated ${updated} rows`);
if (missed.length) console.log('NOT FOUND:', missed.join(' | '));
await sql.end();
