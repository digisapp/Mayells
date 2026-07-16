-- Mayells Seed Data: Inaugural Season 2026 (placeholder catalog)
-- Six forward-dated departmental sales in preview/scheduled status with
-- fully catalogued placeholder lots, plus gallery and private-sale inventory.
--
-- IMPORTANT: These lots are staging placeholders. Before any sale opens for
-- bidding, placeholder lots MUST be replaced with real consignments or
-- withdrawn. No lot here carries fabricated sale results, bid history, or
-- verifiable document claims (certificate numbers, named prior sales).

-- ============================================
-- 0. CLEANUP — remove seed data for re-runs
-- ============================================
DELETE FROM auction_lots WHERE auction_id IN (
  'a0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000003',
  'a0000001-0000-0000-0000-000000000004',
  'a0000001-0000-0000-0000-000000000005',
  'a0000001-0000-0000-0000-000000000006',
  'a0000001-0000-0000-0000-000000000007',
  'a0000001-0000-0000-0000-000000000008',
  'a0000001-0000-0000-0000-000000000009'
);

DELETE FROM lots WHERE id IN (
  '10000001-0000-0000-0000-000000000001',
  '10000001-0000-0000-0000-000000000002',
  '10000001-0000-0000-0000-000000000003',
  '10000001-0000-0000-0000-000000000004',
  '10000001-0000-0000-0000-000000000005',
  '10000001-0000-0000-0000-000000000006',
  '10000001-0000-0000-0000-000000000007',
  '10000001-0000-0000-0000-000000000010',
  '10000001-0000-0000-0000-000000000011',
  '10000001-0000-0000-0000-000000000012',
  '10000001-0000-0000-0000-000000000013',
  '10000001-0000-0000-0000-000000000020',
  '10000001-0000-0000-0000-000000000021',
  '10000001-0000-0000-0000-000000000022',
  '10000001-0000-0000-0000-000000000030',
  '10000001-0000-0000-0000-000000000031',
  '10000001-0000-0000-0000-000000000032',
  '10000001-0000-0000-0000-000000000033',
  '10000001-0000-0000-0000-000000000040',
  '10000001-0000-0000-0000-000000000041',
  '10000001-0000-0000-0000-000000000042',
  '10000001-0000-0000-0000-000000000050',
  '10000001-0000-0000-0000-000000000051',
  '10000001-0000-0000-0000-000000000052',
  '10000001-0000-0000-0000-000000000053',
  '20000001-0000-0000-0000-000000000001',
  '20000001-0000-0000-0000-000000000002',
  '20000001-0000-0000-0000-000000000003',
  '20000001-0000-0000-0000-000000000004',
  '20000001-0000-0000-0000-000000000005',
  '20000001-0000-0000-0000-000000000006',
  '20000001-0000-0000-0000-000000000007',
  '20000001-0000-0000-0000-000000000008',
  '30000001-0000-0000-0000-000000000001',
  '30000001-0000-0000-0000-000000000002',
  '30000001-0000-0000-0000-000000000003',
  '40000001-0000-0000-0000-000000000001',
  '40000001-0000-0000-0000-000000000002',
  '40000001-0000-0000-0000-000000000003',
  '40000001-0000-0000-0000-000000000004',
  '20000001-0000-0000-0000-000000000009',
  '20000001-0000-0000-0000-000000000010',
  '20000001-0000-0000-0000-000000000011',
  '20000001-0000-0000-0000-000000000012',
  '20000001-0000-0000-0000-000000000013'
);

DELETE FROM auctions WHERE id IN (
  'a0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000003',
  'a0000001-0000-0000-0000-000000000004',
  'a0000001-0000-0000-0000-000000000005',
  'a0000001-0000-0000-0000-000000000006',
  'a0000001-0000-0000-0000-000000000007',
  'a0000001-0000-0000-0000-000000000008',
  'a0000001-0000-0000-0000-000000000009'
);

-- ============================================
-- 1. CATEGORIES
-- ============================================
INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'Art', 'art', 'Contemporary, Modern & Old Masters', 1, true),
  ('c0000001-0000-0000-0000-000000000002', 'Antiques', 'antiques', 'Fine antiques & period furniture', 2, true),
  ('c0000001-0000-0000-0000-000000000003', 'Luxury', 'luxury', 'Watches, cars & rare collectibles', 3, true),
  ('c0000001-0000-0000-0000-000000000004', 'Fashion', 'fashion', 'Haute couture & vintage', 4, true),
  ('c0000001-0000-0000-0000-000000000005', 'Jewelry', 'jewelry', 'Fine jewelry & precious stones', 5, true),
  ('c0000001-0000-0000-0000-000000000006', 'Design', 'design', 'Furniture, lighting & objects', 6, true)
ON CONFLICT (slug) DO UPDATE SET
  id = EXCLUDED.id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- 2. INAUGURAL SEASON 2026 — upcoming sales
-- ============================================
INSERT INTO auctions (id, title, subtitle, description, slug, type, status, bidding_starts_at, bidding_ends_at, actual_ended_at, lot_count, total_bids, buyer_premium_percent, is_featured, sale_number, created_at) VALUES

('a0000001-0000-0000-0000-000000000001',
 'Modern & Contemporary Art',
 'The Inaugural Evening Sale',
 'Mayells'' inaugural sale of modern and contemporary art, featuring paintings, sculpture, and works on paper from estates and private collections. Consignments for this sale are now invited through August 21, 2026.',
 'modern-contemporary-art-fall-2026', 'timed', 'preview',
 '2026-09-24 14:00:00', '2026-09-26 20:00:00', NULL,
 9, 0, 25, true, 'MA-2601', '2026-07-01 00:00:00'),

('a0000001-0000-0000-0000-000000000002',
 'Important Jewels: The Palm Beach Sale',
 'Signed Pieces & Fine Gemstones',
 'Fine jewelry from Palm Beach and Boca Raton estates, featuring signed pieces and important colored stones and diamonds. Consignments for this sale are now invited through September 4, 2026.',
 'important-jewels-palm-beach-fall-2026', 'timed', 'preview',
 '2026-10-08 10:00:00', '2026-10-10 18:00:00', NULL,
 6, 0, 25, true, 'JW-2602', '2026-07-01 00:00:00'),

('a0000001-0000-0000-0000-000000000003',
 'Fine Antiques & European Decorative Arts',
 'English & Continental Furniture, Silver & Porcelain',
 'Important English and French furniture, porcelain, silver, and decorative objects from the 17th through 19th centuries. Consignments for this sale are now invited through September 18, 2026.',
 'fine-antiques-european-fall-2026', 'timed', 'scheduled',
 '2026-10-22 12:00:00', '2026-10-24 20:00:00', NULL,
 3, 0, 25, false, 'AN-2603', '2026-07-01 00:00:00'),

('a0000001-0000-0000-0000-000000000004',
 'Luxury Watches & Accessories',
 'Patek Philippe, Rolex & Audemars Piguet',
 'Fine timepieces from the golden era of Swiss watchmaking alongside contemporary icons, together with important handbags and accessories. Consignments for this sale are now invited through October 2, 2026.',
 'luxury-watches-fall-2026', 'timed', 'scheduled',
 '2026-11-05 10:00:00', '2026-11-07 18:00:00', NULL,
 4, 0, 25, true, 'LW-2604', '2026-07-01 00:00:00'),

('a0000001-0000-0000-0000-000000000005',
 'Haute Couture & Vintage Fashion',
 'Five Decades of the Great Houses',
 'Exceptional couture and vintage pieces from Chanel, Hermès, Dior, and Yves Saint Laurent. Consignments for this sale are now invited through October 16, 2026.',
 'haute-couture-vintage-fall-2026', 'timed', 'scheduled',
 '2026-11-19 14:00:00', '2026-11-21 20:00:00', NULL,
 3, 0, 25, false, 'FA-2605', '2026-07-01 00:00:00'),

('a0000001-0000-0000-0000-000000000006',
 '20th Century Design: Icons of Modernism',
 'From Bauhaus to Memphis',
 'Furniture, lighting, and objects by the most important designers of the modern era. Consignments for this sale are now invited through October 30, 2026.',
 '20th-century-design-winter-2026', 'timed', 'scheduled',
 '2026-12-03 10:00:00', '2026-12-05 18:00:00', NULL,
 4, 0, 25, true, 'DS-2606', '2026-07-01 00:00:00');


-- ============================================
-- 3. AUCTION LOTS (all preview — no bids, no results)
-- ============================================
INSERT INTO lots (id, title, subtitle, description, category_id, artist, period, circa, origin, medium, dimensions, condition, condition_notes, provenance, status, sale_type, estimate_low, estimate_high, reserve_price, starting_bid, is_featured, slug, lot_number, created_at) VALUES

-- ---- Modern & Contemporary Art (Sale MA-2601) ----
('10000001-0000-0000-0000-000000000001',
 'Composition in Blue and Gold',
 'A Masterwork of Gestural Abstraction',
 'This commanding canvas exemplifies the artist''s mature period, when bold chromatic experiments merged with an increasingly confident approach to spatial dynamics. Layers of cerulean, ultramarine, and gold leaf create a luminous surface that seems to pulse with internal light. The work demonstrates the artist''s mastery of color field painting while maintaining the gestural energy of abstract expressionism.',
 'c0000001-0000-0000-0000-000000000001', 'Elena Vasquez', 'Contemporary', 'circa 2019', 'United States', 'Oil and gold leaf on canvas', '72 x 60 inches (182.9 x 152.4 cm)', 'excellent', 'Minor surface dust. No visible craquelure. Stretcher bar in excellent condition.', 'Private Collection, Palm Beach, Florida',
 'in_auction', 'auction', 4000000, 6000000, 3500000, 3000000, true,
 'composition-blue-gold-vasquez', 1, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000002',
 'Untitled (Red Series No. 7)',
 NULL,
 'A powerful example from the artist''s celebrated Red Series, this work radiates with an intensity that transcends its physical dimensions. The deep cadmium red ground is animated by subtle variations in tone and texture, revealing the artist''s painstaking process of building color through dozens of translucent layers.',
 'c0000001-0000-0000-0000-000000000001', 'Marcus Chen', 'Contemporary', '2021', 'United States', 'Acrylic on linen', '48 x 48 inches (121.9 x 121.9 cm)', 'mint', 'Perfect condition. Never exhibited.', 'Acquired directly from the artist''s studio, 2021',
 'in_auction', 'auction', 1500000, 2500000, 1200000, 1000000, true,
 'untitled-red-series-7-chen', 2, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000003',
 'Jardin de Luxembourg, Autumn',
 NULL,
 'A luminous plein-air painting capturing the golden light of autumn in Paris''s beloved Luxembourg Gardens. The artist''s impressionistic brushwork creates a shimmering surface that perfectly evokes the fleeting quality of seasonal light filtering through the trees.',
 'c0000001-0000-0000-0000-000000000001', 'Henri Beaumont', 'Post-Impressionist', 'circa 1928', 'France', 'Oil on canvas', '24 x 30 inches (61 x 76.2 cm)', 'very_good', 'Light craquelure consistent with age. Original stretcher. Professionally cleaned 2018.', 'Private Collection, New York; thence by descent',
 'in_auction', 'auction', 8000000, 12000000, 7000000, 5000000, true,
 'jardin-luxembourg-autumn-beaumont', 3, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000004',
 'Bronze Figure: The Dancer',
 'Edition 3 of 8',
 'A graceful bronze sculpture capturing a dancer in mid-movement, the body arched in an elegant arabesque. The patinated surface reveals the artist''s masterful handling of form and light, creating a sense of weightlessness in solid bronze.',
 'c0000001-0000-0000-0000-000000000001', 'Isabella Fontana', 'Contemporary', '2018', 'Italy', 'Patinated bronze on marble base', '28 x 14 x 12 inches (71.1 x 35.6 x 30.5 cm)', 'excellent', 'Fine original patina. Minor wear to base.', 'Private Collection, Milan',
 'in_auction', 'auction', 3000000, 5000000, 2500000, 2000000, false,
 'bronze-dancer-fontana', 4, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000005',
 'Neon Skyline: Miami After Dark',
 NULL,
 'A vibrant large-scale work depicting Miami''s iconic skyline rendered in electric neon hues against a deep indigo night sky. The artist''s signature use of fluorescent pigments creates an otherworldly glow that seems to emanate from the canvas itself.',
 'c0000001-0000-0000-0000-000000000001', 'Diego Ramirez', 'Contemporary', '2023', 'United States', 'Fluorescent acrylic and spray paint on canvas', '60 x 96 inches (152.4 x 243.8 cm)', 'mint', 'Pristine condition. Gallery-wrapped edges.', 'Acquired at Art Basel Miami Beach, 2023',
 'in_auction', 'auction', 2000000, 3000000, 1800000, 1500000, false,
 'neon-skyline-miami-ramirez', 5, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000006',
 'Still Life with Anemones and Lemons',
 NULL,
 'A sumptuous still life in the tradition of the Dutch Golden Age masters, rendered with meticulous attention to the interplay of light on diverse surfaces. The deep crimson anemones set against acid-yellow lemons and a pewter vessel create a composition of extraordinary chromatic richness.',
 'c0000001-0000-0000-0000-000000000001', 'Clara van der Berg', 'Contemporary Realism', '2022', 'Netherlands', 'Oil on panel', '20 x 24 inches (50.8 x 61 cm)', 'excellent', 'Excellent condition throughout. Original frame.', 'Acquired from the artist''s solo exhibition, Amsterdam, 2022',
 'in_auction', 'auction', 1500000, 2500000, 1200000, 1000000, false,
 'still-life-anemones-vanderberg', 6, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000007',
 'Abstract Landscape: Pacific Coast',
 NULL,
 'An expansive canvas that distills the California coastline into pure fields of color — bands of sapphire, foam-white, and sun-bleached gold stretch horizontally across the surface, evoking the vast Pacific horizon without recourse to literal representation.',
 'c0000001-0000-0000-0000-000000000001', 'James Thornton', 'Contemporary', '2020', 'United States', 'Oil and wax on canvas', '48 x 72 inches (121.9 x 182.9 cm)', 'excellent', 'Excellent condition. Minor dust. Unframed.', 'Private Collection, Los Angeles',
 'in_auction', 'auction', 3500000, 5000000, 3000000, 2500000, true,
 'abstract-landscape-pacific-thornton', 7, '2026-07-01 00:00:00'),

('40000001-0000-0000-0000-000000000001',
 'Water Lilies Study',
 'After Claude Monet',
 'A captivating study of water lilies in the manner of Monet, rendered with broken brushwork and sensitivity to the play of light on water. The palette of blues, greens, and soft pinks creates a meditative atmosphere that invites prolonged contemplation.',
 'c0000001-0000-0000-0000-000000000001', 'After Claude Monet', 'Impressionist', 'circa 1920', 'France', 'Oil on canvas', '28 x 36 inches (71.1 x 91.4 cm)', 'very_good', 'Cleaned and relined. Original stretcher replaced. Minor inpainting to lower right corner.', 'Private Collection, Switzerland; Private Collection, New York',
 'in_auction', 'auction', 1800000, 2800000, 1500000, 1200000, true,
 'water-lilies-study-monet-school', 8, '2026-07-01 00:00:00'),

('40000001-0000-0000-0000-000000000002',
 'Femme au Chapeau Rouge',
 'School of Matisse',
 'A vibrant portrait study depicting a woman in a striking red hat, executed with bold, confident brushstrokes and a vivid palette. The work captures the joie de vivre of Parisian café culture in the early 20th century.',
 'c0000001-0000-0000-0000-000000000001', 'School of Matisse', 'Fauve', 'circa 1907', 'France', 'Oil on canvas', '24 x 20 inches (61 x 50.8 cm)', 'good', 'Surface cleaned. Minor craquelure. Old restoration to upper left visible under UV.', 'Private Collection, London',
 'in_auction', 'auction', 800000, 1200000, 700000, 500000, true,
 'femme-chapeau-rouge-matisse-school', 9, '2026-07-01 00:00:00'),

-- ---- Important Jewels (Sale JW-2602) ----
('10000001-0000-0000-0000-000000000010',
 'Art Deco Diamond and Platinum Bracelet',
 'Cartier, Paris, circa 1925',
 'A magnificent Art Deco bracelet composed of geometric links set with old European-cut diamonds totaling approximately 18.50 carats, accented by calibré-cut sapphires. The bracelet exemplifies the finest Art Deco craftsmanship with its clean lines and extraordinary stone quality.',
 'c0000001-0000-0000-0000-000000000005', 'Cartier', 'Art Deco', 'circa 1925', 'France', 'Platinum, diamonds, sapphires', '7 inches (17.8 cm) length', 'excellent', 'Excellent condition. All stones secure. Clasp functions perfectly. Minor surface wear consistent with age.', 'From a Palm Beach estate; thence by descent',
 'in_auction', 'auction', 15000000, 20000000, 12000000, 10000000, true,
 'art-deco-diamond-bracelet-cartier', 1, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000011',
 'Natural Fancy Vivid Yellow Diamond Ring',
 '12.03 Carats',
 'An extraordinary cushion-cut Fancy Vivid Yellow diamond weighing 12.03 carats, set in a platinum and 18K yellow gold mounting with trapezoid-shaped white diamond shoulders. Accompanied by an independent gemological laboratory report.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Contemporary', '2020', 'South Africa', 'Platinum, 18K gold, natural diamond', 'Ring size 6.5', 'mint', 'Unworn condition. Complete with original box and gemological report.', 'Private Collection, New York',
 'in_auction', 'auction', 30000000, 45000000, 28000000, 25000000, true,
 'fancy-vivid-yellow-diamond-ring', 2, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000012',
 'Van Cleef & Arpels Alhambra Necklace',
 'Vintage Long Necklace, 20 Motifs',
 'The iconic Alhambra long necklace in 18K yellow gold featuring twenty motifs set with mother-of-pearl, from Van Cleef & Arpels'' beloved Alhambra collection. A timeless piece that has become synonymous with everyday luxury.',
 'c0000001-0000-0000-0000-000000000005', 'Van Cleef & Arpels', 'Contemporary', '2022', 'France', '18K yellow gold, mother-of-pearl', '33.5 inches (85 cm) length', 'excellent', 'Light wear consistent with occasional use. All motifs intact.', 'Private Collection, Palm Beach',
 'in_auction', 'auction', 2500000, 3500000, 2200000, 2000000, false,
 'vca-alhambra-necklace-20motifs', 3, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000013',
 'Colombian Emerald and Diamond Pendant',
 'Approximately 8.50 Carats',
 'A rare and important pendant centering an oval-shaped Colombian emerald of approximately 8.50 carats, surrounded by a double halo of brilliant-cut white diamonds. The vivid, saturated green color and exceptional transparency make this an extraordinary stone. Accompanied by an independent gemological report.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Contemporary', '2019', 'Colombia', 'Platinum, emerald, diamonds', 'Pendant: 1.5 x 1 inch; Chain: 18 inches', 'mint', 'Unworn. Accompanied by an independent gemological report.', 'Private Collection, Miami',
 'in_auction', 'auction', 12000000, 18000000, 10000000, 8000000, true,
 'colombian-emerald-pendant-no-oil', 4, '2026-07-01 00:00:00'),

('40000001-0000-0000-0000-000000000003',
 'Bulgari Serpenti Necklace',
 '18K Gold and Diamonds',
 'The iconic Bulgari Serpenti necklace in 18K rose gold, the snake''s body set with pavé diamonds and the eyes accented by emerald cabochons. A powerful symbol of seduction and transformation.',
 'c0000001-0000-0000-0000-000000000005', 'Bulgari', 'Contemporary', '2023', 'Italy', '18K rose gold, diamonds, emeralds', '16 inches (40.6 cm) length', 'mint', 'Unworn. Complete with box and papers.', 'Private Collection, Bal Harbour',
 'in_auction', 'auction', 4500000, 6500000, 4000000, 3500000, true,
 'bulgari-serpenti-necklace-rose-gold', 5, '2026-07-01 00:00:00'),

('40000001-0000-0000-0000-000000000004',
 'Tiffany & Co. Schlumberger Bracelet',
 'Enamel and Gold, circa 1970',
 'A rare and collectible bracelet by Jean Schlumberger for Tiffany & Co., featuring alternating panels of vivid blue paillonné enamel and 18K yellow gold set with round brilliant diamonds. Schlumberger''s exuberant designs are among the most collectible in American jewelry.',
 'c0000001-0000-0000-0000-000000000005', 'Jean Schlumberger for Tiffany & Co.', 'Vintage', 'circa 1970', 'United States', '18K yellow gold, enamel, diamonds', '7 inches (17.8 cm) length', 'excellent', 'Excellent vintage condition. Enamel intact with no chips. All diamonds present. Tiffany & Co. marks.', 'From a Boca Raton estate; thence by descent',
 'in_auction', 'auction', 3000000, 5000000, 2500000, 2000000, false,
 'schlumberger-tiffany-bracelet-enamel', 6, '2026-07-01 00:00:00'),

-- ---- Fine Antiques & European Decorative Arts (Sale AN-2603) ----
('10000001-0000-0000-0000-000000000020',
 'Louis XV Ormolu-Mounted Kingwood Commode',
 'Attributed to Charles Cressent, circa 1740',
 'A superb Louis XV commode of serpentine form, veneered in kingwood and tulipwood with ormolu mounts of exceptional quality. The marble top is original, and the commode retains much of its original gilding. The fluid, rocaille-inspired mounts are characteristic of the finest ébénistes of the period.',
 'c0000001-0000-0000-0000-000000000002', 'Charles Cressent', 'Louis XV', 'circa 1740', 'France', 'Kingwood, tulipwood, ormolu, marble', '34 x 52 x 24 inches (86.4 x 132.1 x 61 cm)', 'very_good', 'Original marble top with minor chips to edges. Ormolu mounts retain approximately 80% of original gilding. Some veneer restoration to the sides. Structurally sound.', 'Private Collection, New York',
 'in_auction', 'auction', 8000000, 12000000, 7000000, 5000000, true,
 'louis-xv-commode-cressent', 1, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000021',
 'George III Silver Epergne',
 'Thomas Pitts, London, 1773',
 'A magnificent George III silver epergne of grand scale, the central basket surmounted by a cast pineapple finial, supported on four scrolling branches with detachable baskets, raised on a shaped base with four shell and scroll feet.',
 'c0000001-0000-0000-0000-000000000002', 'Thomas Pitts', 'Georgian', '1773', 'England', 'Sterling silver', '24 inches (61 cm) height; approximately 180 troy ounces', 'very_good', 'Good condition overall. Fully hallmarked London 1773. Minor dents to one satellite basket. All branches and baskets present.', 'Private Collection, Connecticut',
 'in_auction', 'auction', 4000000, 6000000, 3500000, 3000000, false,
 'george-iii-silver-epergne-pitts', 2, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000022',
 'Meissen Porcelain Swan Service Tureen',
 'After the Model by Johann Joachim Kändler, circa 1740',
 'A rare Meissen porcelain tureen and cover from the celebrated Swan Service, the body modeled in low relief with swans among bulrushes, the cover surmounted by a swan finial. The Swan Service, originally created for Count Heinrich von Brühl, is among the most important porcelain services ever produced.',
 'c0000001-0000-0000-0000-000000000002', 'Johann Joachim Kändler', 'Baroque', 'circa 1740', 'Germany', 'Meissen hard-paste porcelain', '14 x 16 x 10 inches (35.6 x 40.6 x 25.4 cm)', 'good', 'Minor professional restoration to rim of cover. Small chip to one handle restored. Blue crossed swords mark to base.', 'Private European Collection',
 'in_auction', 'auction', 6000000, 9000000, 5000000, 4000000, true,
 'meissen-swan-service-tureen', 3, '2026-07-01 00:00:00'),

-- ---- Luxury Watches & Accessories (Sale LW-2604) ----
('10000001-0000-0000-0000-000000000030',
 'Patek Philippe Ref. 5711/1A Nautilus',
 'Blue Dial, Full Set, Discontinued',
 'The legendary Patek Philippe Nautilus Reference 5711/1A-010 with the coveted blue sunburst dial. This discontinued icon of modern watchmaking features the caliber 26-330 S C self-winding movement and comes as a complete set with original box and papers.',
 'c0000001-0000-0000-0000-000000000003', 'Patek Philippe', 'Contemporary', '2021', 'Switzerland', 'Stainless steel, sapphire crystal', '40mm case diameter', 'mint', 'Unworn condition. Complete with box and papers. All stickers intact.', 'Purchased from an authorized dealer, Geneva, 2021',
 'in_auction', 'auction', 12000000, 16000000, 11000000, 10000000, true,
 'patek-philippe-nautilus-5711', 1, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000031',
 'Rolex Daytona Ref. 6263 "Paul Newman"',
 'Exotic Dial, circa 1972',
 'An exceptional example of the highly coveted Rolex Cosmograph Daytona Reference 6263 featuring the exotic "Paul Newman" dial in cream with black sub-dials. The watch retains its original bezel, pushers, and crown, and the Valjoux 727 movement runs within specification.',
 'c0000001-0000-0000-0000-000000000003', 'Rolex', 'Vintage', 'circa 1972', 'Switzerland', 'Stainless steel', '37mm case diameter', 'very_good', 'Excellent original condition for age. Case shows minimal polishing. Original tritium lume has aged to a warm cream. Crystal replaced. Service history available.', 'Private Collection, Miami',
 'in_auction', 'auction', 25000000, 35000000, 22000000, 20000000, true,
 'rolex-daytona-6263-paul-newman', 2, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000032',
 'Audemars Piguet Royal Oak Perpetual Calendar',
 'Ref. 26574ST, Blue Dial',
 'The Royal Oak Perpetual Calendar in stainless steel with a stunning blue "Grande Tapisserie" dial displaying day, date, month, moonphase, and leap year indicator. Powered by the caliber 5134 self-winding movement with 40-hour power reserve.',
 'c0000001-0000-0000-0000-000000000003', 'Audemars Piguet', 'Contemporary', '2023', 'Switzerland', 'Stainless steel, sapphire crystal', '41mm case diameter', 'excellent', 'Light wear consistent with occasional use. Complete with box and papers.', 'Purchased from an authorized dealer, New York, 2023',
 'in_auction', 'auction', 8000000, 11000000, 7000000, 6000000, false,
 'ap-royal-oak-perpetual-26574', 3, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000033',
 'Hermès Birkin 30 Himalaya Niloticus Crocodile',
 'Palladium Hardware, 2024',
 'The Hermès Birkin 30 in Himalaya Niloticus Crocodile with palladium hardware is among the most sought-after handbags in the world. The graduated coloring from smoky grey to pearly white mimics the majestic Himalayan mountain range.',
 'c0000001-0000-0000-0000-000000000003', 'Hermès', 'Contemporary', '2024', 'France', 'Niloticus crocodile, palladium hardware', '30 x 22 x 16 cm', 'mint', 'Pristine, never carried. Complete with dustbag, clochette, keys, lock, rain jacket, box, and ribbon.', 'Private Collection, Paris',
 'in_auction', 'auction', 35000000, 50000000, 30000000, 28000000, true,
 'hermes-birkin-30-himalaya', 4, '2026-07-01 00:00:00'),

-- ---- Haute Couture & Vintage Fashion (Sale FA-2605) ----
('10000001-0000-0000-0000-000000000040',
 'Chanel Haute Couture Evening Gown',
 'Karl Lagerfeld, Fall/Winter 2015',
 'A breathtaking black silk organza evening gown with hand-embroidered sequin and crystal detail from Karl Lagerfeld''s penultimate collection for Chanel. The gown features a fitted bodice with off-shoulder neckline and a full, layered skirt with cascading ruffles.',
 'c0000001-0000-0000-0000-000000000004', 'Karl Lagerfeld for Chanel', 'Haute Couture', '2015', 'France', 'Silk organza, sequins, crystals', 'Size FR 36 (US 4)', 'excellent', 'Excellent condition. All embroidery intact. Minor perspiration marks to lining professionally addressed. Chanel haute couture label present.', 'Private European Collection',
 'in_auction', 'auction', 3000000, 5000000, 2500000, 2000000, false,
 'chanel-couture-evening-gown-lagerfeld', 1, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000041',
 'Hermès Kelly 28 Sellier Ostrich',
 'Terre Cuite, Gold Hardware, 2023',
 'The Hermès Kelly 28 Sellier in Terre Cuite ostrich leather with gold hardware. The Sellier construction with its clean, structured lines and external stitching represents the most formal and sought-after version of this iconic design.',
 'c0000001-0000-0000-0000-000000000004', 'Hermès', 'Contemporary', '2023', 'France', 'Ostrich leather, gold hardware', '28 x 22 x 10 cm', 'mint', 'Brand new, never used. All protective plastics in place. Complete with dustbag, clochette, keys, lock, shoulder strap, box, and ribbon.', 'Private Collection, Boca Raton',
 'in_auction', 'auction', 4500000, 6000000, 4000000, 3500000, true,
 'hermes-kelly-28-ostrich-terre-cuite', 2, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000042',
 'Vintage Yves Saint Laurent Le Smoking Tuxedo',
 'Haute Couture, Autumn/Winter 1966',
 'An extraordinarily rare and historically important Le Smoking tuxedo from Yves Saint Laurent''s groundbreaking 1966 collection that revolutionized women''s fashion. This museum-quality ensemble comprises a satin-trimmed grain de poudre wool jacket and matching trousers.',
 'c0000001-0000-0000-0000-000000000004', 'Yves Saint Laurent', 'Haute Couture', '1966', 'France', 'Grain de poudre wool, silk satin', 'Size FR 38 (US 6)', 'good', 'Good vintage condition. Minor moth repair to left sleeve professionally executed. Satin collar shows light wear. YSL haute couture label and atelier number intact.', 'From a New York estate; thence by descent',
 'in_auction', 'auction', 8000000, 12000000, 7000000, 5000000, true,
 'ysl-le-smoking-1966-couture', 3, '2026-07-01 00:00:00'),

-- ---- 20th Century Design (Sale DS-2606) ----
('10000001-0000-0000-0000-000000000050',
 'Charlotte Perriand "Bibliothèque" Bookcase',
 'Steph Simon Edition, circa 1958',
 'A rare and important Bibliothèque bookcase designed by Charlotte Perriand for Steph Simon. The oak structure with painted aluminum sliding doors in signature colors embodies the architect''s rational approach to living space and storage.',
 'c0000001-0000-0000-0000-000000000006', 'Charlotte Perriand', 'Mid-Century Modern', 'circa 1958', 'France', 'Oak, painted aluminum, steel', '83 x 88 x 14 inches (210.8 x 223.5 x 35.6 cm)', 'very_good', 'Original paint to doors with expected wear. Oak shelves show patina consistent with age. Structurally excellent.', 'Private Collection, Paris; Private Collection, New York',
 'in_auction', 'auction', 10000000, 15000000, 9000000, 7000000, true,
 'perriand-bibliotheque-steph-simon', 1, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000051',
 'George Nakashima "Conoid" Bench',
 'American Black Walnut, 1974',
 'A magnificent Conoid bench in American black walnut with a dramatic free-edge slab and single rosewood butterfly joint, produced at the Nakashima Studio, New Hope, Pennsylvania. Accompanied by studio documentation.',
 'c0000001-0000-0000-0000-000000000006', 'George Nakashima', 'Mid-Century Modern', '1974', 'United States', 'American black walnut, rosewood', '32 x 84 x 36 inches (81.3 x 213.4 x 91.4 cm)', 'excellent', 'Excellent original condition. Beautiful natural patina. Original finish. One minor scratch to top.', 'Commissioned by the original owner, 1974; Private Collection, Pennsylvania',
 'in_auction', 'auction', 6000000, 9000000, 5000000, 4000000, true,
 'nakashima-conoid-bench-1974', 2, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000052',
 'Poul Henningsen PH Artichoke Pendant',
 'Early Production, Louis Poulsen, circa 1960',
 'An early production PH Artichoke pendant lamp designed by Poul Henningsen for Louis Poulsen. The twelve rows of hand-assembled copper leaves create the signature form that has become one of the most recognizable lighting designs of the 20th century.',
 'c0000001-0000-0000-0000-000000000006', 'Poul Henningsen', 'Mid-Century Modern', 'circa 1960', 'Denmark', 'Copper, chromium-plated steel', '27 inches (68.6 cm) diameter', 'very_good', 'Original copper finish with beautiful natural patina. All leaves present and properly aligned. Original canopy included. Rewired for US standards.', 'Private Collection, Copenhagen',
 'in_auction', 'auction', 2000000, 3000000, 1800000, 1500000, false,
 'ph-artichoke-pendant-henningsen', 3, '2026-07-01 00:00:00'),

('10000001-0000-0000-0000-000000000053',
 'Ettore Sottsass "Carlton" Room Divider',
 'Memphis Milano, 1981',
 'The iconic Carlton room divider/bookshelf by Ettore Sottsass, produced by Memphis Milano in 1981. This totemic piece, with its plastic laminate surfaces in bold primary colors, is perhaps the single most recognizable design from the Memphis movement.',
 'c0000001-0000-0000-0000-000000000006', 'Ettore Sottsass', 'Postmodern', '1981', 'Italy', 'Wood, plastic laminate', '77 x 75 x 16 inches (195.6 x 190.5 x 40.6 cm)', 'good', 'Good condition. Minor edge wear to laminate. Light scratches to shelving surfaces. Original label present.', 'Collection of an Italian Architect, Milan',
 'in_auction', 'auction', 3500000, 5000000, 3000000, 2500000, false,
 'sottsass-carlton-memphis', 4, '2026-07-01 00:00:00');


-- ============================================
-- 4. AUCTION_LOTS — link lots to their sales
-- ============================================
INSERT INTO auction_lots (auction_id, lot_id, lot_number, closing_at) VALUES
-- Modern & Contemporary Art (ends 2026-09-26)
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000001', 1, '2026-09-26 20:00:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000002', 2, '2026-09-26 20:02:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000003', 3, '2026-09-26 20:04:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000004', 4, '2026-09-26 20:06:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000005', 5, '2026-09-26 20:08:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000006', 6, '2026-09-26 20:10:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000007', 7, '2026-09-26 20:12:00'),
('a0000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', 8, '2026-09-26 20:14:00'),
('a0000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000002', 9, '2026-09-26 20:16:00'),
-- Important Jewels (ends 2026-10-10)
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000010', 1, '2026-10-10 18:00:00'),
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000011', 2, '2026-10-10 18:02:00'),
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000012', 3, '2026-10-10 18:04:00'),
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000013', 4, '2026-10-10 18:06:00'),
('a0000001-0000-0000-0000-000000000002', '40000001-0000-0000-0000-000000000003', 5, '2026-10-10 18:08:00'),
('a0000001-0000-0000-0000-000000000002', '40000001-0000-0000-0000-000000000004', 6, '2026-10-10 18:10:00'),
-- Fine Antiques (ends 2026-10-24)
('a0000001-0000-0000-0000-000000000003', '10000001-0000-0000-0000-000000000020', 1, '2026-10-24 20:00:00'),
('a0000001-0000-0000-0000-000000000003', '10000001-0000-0000-0000-000000000021', 2, '2026-10-24 20:02:00'),
('a0000001-0000-0000-0000-000000000003', '10000001-0000-0000-0000-000000000022', 3, '2026-10-24 20:04:00'),
-- Luxury Watches & Accessories (ends 2026-11-07)
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000030', 1, '2026-11-07 18:00:00'),
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000031', 2, '2026-11-07 18:02:00'),
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000032', 3, '2026-11-07 18:04:00'),
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000033', 4, '2026-11-07 18:06:00'),
-- Haute Couture (ends 2026-11-21)
('a0000001-0000-0000-0000-000000000005', '10000001-0000-0000-0000-000000000040', 1, '2026-11-21 20:00:00'),
('a0000001-0000-0000-0000-000000000005', '10000001-0000-0000-0000-000000000041', 2, '2026-11-21 20:02:00'),
('a0000001-0000-0000-0000-000000000005', '10000001-0000-0000-0000-000000000042', 3, '2026-11-21 20:04:00'),
-- 20th Century Design (ends 2026-12-05)
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000050', 1, '2026-12-05 18:00:00'),
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000051', 2, '2026-12-05 18:02:00'),
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000052', 3, '2026-12-05 18:04:00'),
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000053', 4, '2026-12-05 18:06:00');


-- ============================================
-- 5. GALLERY (Buy Now) LOTS
-- ============================================
INSERT INTO lots (id, title, subtitle, description, category_id, artist, period, circa, origin, medium, dimensions, condition, condition_notes, provenance, status, sale_type, buy_now_price, estimate_low, estimate_high, is_featured, slug, created_at) VALUES

('20000001-0000-0000-0000-000000000001',
 'Venetian Glass Chandelier',
 'Murano, 12 Arms',
 'A stunning hand-blown Murano glass chandelier featuring twelve arms with crystal drops and gold-infused glass flowers. Each arm terminates in a candle-style light fitting. The warm gold tones and crystalline clarity create a magnificent centerpiece.',
 'c0000001-0000-0000-0000-000000000006', NULL, 'Contemporary', '2022', 'Italy', 'Hand-blown Murano glass, gold leaf', '36 inches diameter x 42 inches height', 'excellent', 'Excellent condition. Professionally wired for US standards. All glass elements intact. Minor dust.', 'Private Collection, Palm Beach',
 'for_sale', 'gallery', 1850000, 1500000, 2500000, true,
 'venetian-glass-chandelier-murano', '2026-06-15 00:00:00'),

('20000001-0000-0000-0000-000000000002',
 'Art Deco Diamond Tennis Bracelet',
 '8.50 Total Carat Weight',
 'An elegant Art Deco-inspired tennis bracelet featuring 42 round brilliant-cut diamonds totaling approximately 8.50 carats, F-G color, VS clarity, set in platinum with milgrain detailing. The geometric links evoke the sophistication of the 1920s.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Art Deco Revival', '2023', 'United States', 'Platinum, diamonds', '7 inches (17.8 cm) length', 'mint', 'Unworn. Complete with appraisal and insurance documentation.', 'Private Collection, Boca Raton',
 'for_sale', 'gallery', 2200000, 1800000, 2800000, true,
 'art-deco-diamond-tennis-bracelet', '2026-06-20 00:00:00'),

('20000001-0000-0000-0000-000000000003',
 'Coastal Landscape: Morning Tide',
 NULL,
 'A serene and luminous seascape capturing the golden light of early morning along the Florida coast. Soft washes of peach, lavender, and aquamarine create an atmospheric composition that evokes the tranquility of dawn on the Atlantic.',
 'c0000001-0000-0000-0000-000000000001', 'Sarah Mitchell', 'Contemporary', '2024', 'United States', 'Oil on linen', '36 x 48 inches (91.4 x 121.9 cm)', 'mint', 'Pristine condition. Gallery-wrapped edges. Ready to hang.', 'Acquired from the artist''s studio, Palm Beach, 2024',
 'for_sale', 'gallery', 850000, 600000, 1200000, true,
 'coastal-landscape-morning-tide-mitchell', '2026-07-01 00:00:00'),

('20000001-0000-0000-0000-000000000004',
 'Hermès Constance 24 Epsom',
 'Gold, Palladium Hardware',
 'The coveted Hermès Constance 24 in Gold Epsom leather with palladium hardware. The Constance is one of Hermès'' most iconic and difficult-to-acquire designs, featuring the signature H-clasp closure.',
 'c0000001-0000-0000-0000-000000000004', 'Hermès', 'Contemporary', '2024', 'France', 'Epsom calfskin, palladium hardware', '24 x 15 x 6 cm', 'mint', 'Brand new, never carried. Complete with box, dustbag, and care card.', 'Private Collection, Palm Beach',
 'for_sale', 'gallery', 1650000, 1400000, 2000000, false,
 'hermes-constance-24-gold-epsom', '2026-07-05 00:00:00'),

('20000001-0000-0000-0000-000000000005',
 'Pair of Mid-Century Brass Table Lamps',
 'In the Manner of Gabriella Crespi',
 'An elegant pair of sculptural brass table lamps in the manner of Gabriella Crespi, featuring organic bamboo-form stems with original silk shades. The warm brass finish has developed a beautiful natural patina.',
 'c0000001-0000-0000-0000-000000000006', NULL, 'Mid-Century Modern', 'circa 1970', 'Italy', 'Brass, silk', '28 inches height each', 'very_good', 'Original patina. Shades show minor age-related discoloration. Rewired. Working perfectly.', 'Private Collection, Miami',
 'for_sale', 'gallery', 480000, 350000, 650000, false,
 'mid-century-brass-lamps-crespi-style', '2026-07-08 00:00:00'),

('20000001-0000-0000-0000-000000000006',
 'Cartier Tank Française Watch',
 'Medium, Steel and Gold',
 'The timeless Cartier Tank Française in stainless steel and 18K yellow gold with a silver guilloché dial. Powered by a quartz movement. Complete with original box and papers.',
 'c0000001-0000-0000-0000-000000000003', 'Cartier', 'Contemporary', '2022', 'Switzerland', 'Stainless steel, 18K yellow gold', '30 x 25 mm', 'excellent', 'Light wear. Crystal perfect. Bracelet in excellent condition with all original links.', 'Private Collection, Palm Beach',
 'for_sale', 'gallery', 520000, 400000, 650000, false,
 'cartier-tank-francaise-two-tone', '2026-07-10 00:00:00'),

('20000001-0000-0000-0000-000000000007',
 'Vintage Chanel Classic Flap Bag',
 'Medium, Black Lambskin, Gold Hardware',
 'The quintessential Chanel Classic Medium Double Flap bag in black lambskin leather with 24K gold-plated hardware. This vintage example from the early 1990s features the iconic interlocking CC turn-lock closure and woven chain strap.',
 'c0000001-0000-0000-0000-000000000004', 'Chanel', 'Vintage', 'circa 1994', 'France', 'Lambskin leather, 24K gold-plated hardware', '10 x 6 x 2.5 inches', 'very_good', 'Beautiful vintage condition. Lambskin is supple with light corner wear. Interior clean. Hardware retains good plating. Authenticity card and dustbag included.', 'Private Collection, Palm Beach',
 'for_sale', 'gallery', 780000, 600000, 950000, false,
 'vintage-chanel-classic-flap-black', '2026-07-11 00:00:00'),

('20000001-0000-0000-0000-000000000008',
 'The Scholar in His Study',
 'Continental School, 19th Century',
 'An atmospheric cabinet painting in the Dutch 17th-century manner, depicting a bearded scholar at his desk surrounded by the instruments of learning — an hourglass, folios, and candlelight. The warm chiaroscuro and finely rendered textures reward close viewing.',
 'c0000001-0000-0000-0000-000000000001', 'Continental School', '19th Century', 'circa 1860', 'Europe', 'Oil on canvas', '22 x 18 inches (55.9 x 45.7 cm)', 'very_good', 'Old relining. Fine craquelure consistent with age. Later giltwood frame with minor losses.', 'Private Collection, New York',
 'for_sale', 'gallery', 420000, 300000, 550000, false,
 'continental-school-scholar-study', '2026-07-12 00:00:00'),

('20000001-0000-0000-0000-000000000009',
 'Vintage Hermès Silk Scarf',
 'Les Cavaliers d''Or, 90cm',
 'A collectible Hermès silk twill scarf in the beloved Les Cavaliers d''Or pattern, featuring equestrian motifs in rich gold and burgundy tones on a navy ground. Hand-rolled edges. A wearable work of art from the world''s most iconic scarf maker.',
 'c0000001-0000-0000-0000-000000000004', 'Hermès', 'Vintage', 'circa 2005', 'France', 'Silk twill', '90 x 90 cm (36 x 36 inches)', 'excellent', 'Excellent pre-owned condition. Colors vibrant. No pulls or stains. Original box included.', 'Private Collection, Palm Beach',
 'for_sale', 'gallery', 120000, 80000, 150000, false,
 'vintage-hermes-scarf-cavaliers', '2026-07-12 00:00:00'),

('20000001-0000-0000-0000-000000000010',
 'Art Deco Silver Cocktail Shaker',
 'Mappin & Webb, London, circa 1935',
 'A stylish Art Deco silver-plated cocktail shaker of stepped cylindrical form with geometric banding and a built-in strainer. The streamlined silhouette epitomizes the glamour of 1930s entertaining.',
 'c0000001-0000-0000-0000-000000000002', 'Mappin & Webb', 'Art Deco', 'circa 1935', 'England', 'Silver plate', '10 inches (25.4 cm) height', 'very_good', 'Good plate with minor wear to high points. Strainer intact. No dents. Maker''s marks to base.', 'From a Connecticut estate',
 'for_sale', 'gallery', 180000, 120000, 250000, false,
 'art-deco-cocktail-shaker-mappin-webb', '2026-07-13 00:00:00'),

('20000001-0000-0000-0000-000000000011',
 'Signed Contemporary Lithograph',
 'Abstract Composition No. 12, Edition 45/150',
 'A vibrant signed and numbered lithograph by an emerging contemporary artist, featuring bold geometric forms in cerulean blue and vermillion red. Printed on archival Hahnemühle paper with deckled edges.',
 'c0000001-0000-0000-0000-000000000001', 'Amara Osei', 'Contemporary', '2024', 'United States', 'Lithograph on archival paper', '24 x 18 inches (61 x 45.7 cm)', 'mint', 'Pristine. Never framed. Signed and numbered in pencil lower margin.', 'Acquired directly from the artist, 2024',
 'for_sale', 'gallery', 250000, 180000, 350000, false,
 'signed-lithograph-osei-abstract-12', '2026-07-13 00:00:00'),

('20000001-0000-0000-0000-000000000012',
 'Antique Leather-Bound Library Set',
 'The Complete Works of Shakespeare, 12 Volumes',
 'A handsome set of twelve leather-bound volumes of Shakespeare''s complete works. Bound in full morocco leather with gilt tooling, marbled endpapers, and top edges gilt. A distinguished addition to any library.',
 'c0000001-0000-0000-0000-000000000002', NULL, 'Edwardian', 'circa 1910', 'England', 'Morocco leather, gilt, laid paper', '9 x 6 inches each (23 x 15 cm)', 'very_good', 'Bindings tight with minor rubbing to extremities. Interiors clean with occasional foxing to endpapers. A very attractive set.', 'Library of a Connecticut estate',
 'for_sale', 'gallery', 150000, 100000, 200000, false,
 'shakespeare-complete-works-leather', '2026-07-14 00:00:00'),

('20000001-0000-0000-0000-000000000013',
 'Vintage Lalique Crystal Bowl',
 'Pinsons Pattern, Opalescent',
 'A beautiful opalescent crystal bowl by René Lalique in the Pinsons (Finches) pattern, featuring birds perched among leafy branches in molded relief. The signature blue opalescence appears when light passes through the pressed glass.',
 'c0000001-0000-0000-0000-000000000006', 'René Lalique', 'Art Deco', 'circa 1933', 'France', 'Opalescent pressed glass', '9.5 inches (24 cm) diameter', 'excellent', 'No chips or cracks. Light surface scratches to base. Acid-etched R. LALIQUE FRANCE mark.', 'Private Collection, Boca Raton',
 'for_sale', 'gallery', 320000, 250000, 400000, false,
 'lalique-pinsons-bowl-opalescent', '2026-07-14 00:00:00');


-- ============================================
-- 6. PRIVATE SALE LOTS (inquiry only)
-- ============================================
INSERT INTO lots (id, title, subtitle, description, category_id, artist, period, circa, origin, medium, dimensions, condition, condition_notes, provenance, status, sale_type, estimate_low, estimate_high, is_featured, slug, created_at) VALUES

('30000001-0000-0000-0000-000000000001',
 'Continental School: Figure Study in Blue',
 'Watercolor, Early 20th Century',
 'An evocative watercolor depicting a solitary figure rendered in tones of cerulean and cobalt against a muted background. The confident handling of wash and line points to an accomplished continental hand working in the early years of the 20th century.',
 'c0000001-0000-0000-0000-000000000001', 'Continental School', 'Modern', 'circa 1910', 'Europe', 'Watercolor and pencil on paper', '14 x 10 inches (35.6 x 25.4 cm)', 'very_good', 'Good condition for age. Foxing to margins, not affecting image. Archivally matted and framed.', 'Private European Collection',
 'for_sale', 'private', 1200000, 1800000, false,
 'continental-school-figure-study-blue', '2026-06-10 00:00:00'),

('30000001-0000-0000-0000-000000000002',
 'Ceylon Sapphire and Diamond Ring',
 'Approximately 15.80 Carats',
 'An extraordinary cushion-cut Ceylon sapphire of approximately 15.80 carats, of fine cornflower blue color, flanked by half-moon cut diamonds in a platinum mounting. Sapphires of this size and quality rarely come to market. Accompanied by an independent gemological report.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Contemporary', '2018', 'Sri Lanka', 'Platinum, sapphire, diamonds', 'Ring size 5.5', 'mint', 'Unworn. Accompanied by an independent gemological report.', 'Private Collection, Geneva',
 'for_sale', 'private', 15000000, 22000000, true,
 'ceylon-sapphire-ring-cushion', '2026-06-15 00:00:00'),

('30000001-0000-0000-0000-000000000003',
 '2017 Ferrari 488 GTB',
 'Rosso Corsa over Nero, Low Mileage',
 'A striking example of the Ferrari 488 GTB finished in classic Rosso Corsa over Nero leather. Powered by the award-winning 3.9-litre twin-turbocharged V8 producing 661 horsepower. A modern icon offered from single ownership with full service history.',
 'c0000001-0000-0000-0000-000000000003', 'Ferrari', 'Contemporary', '2017', 'Italy', 'Coupé, 3.9L twin-turbocharged V8', 'Odometer: approximately 4,200 miles', 'excellent', 'Excellent condition throughout. Complete service history with an authorized dealer. Recent annual service. Books, tools, and car cover included.', 'Single owner from new; Private Collection, Boca Raton',
 'for_sale', 'private', 25000000, 30000000, true,
 'ferrari-488-gtb-2017', '2026-07-01 00:00:00');
