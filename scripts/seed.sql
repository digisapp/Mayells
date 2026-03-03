-- Mayells Seed Data: Realistic 2025 Past Listings
-- Categories, Auctions, Lots (Auction + Gallery + Private Sales)

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
  '40000001-0000-0000-0000-000000000004'
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
-- 2. PAST AUCTIONS (completed in 2025)
-- ============================================
INSERT INTO auctions (id, title, subtitle, description, slug, type, status, bidding_starts_at, bidding_ends_at, actual_ended_at, lot_count, total_bids, buyer_premium_percent, is_featured, sale_number, created_at) VALUES

-- Spring 2025 Sales
('a0000001-0000-0000-0000-000000000001',
 'Modern & Contemporary Art: Spring 2025',
 'A Premier Evening Sale',
 'An exceptional selection of post-war and contemporary masterworks from distinguished private collections.',
 'modern-contemporary-art-spring-2025', 'timed', 'completed',
 '2025-03-15 14:00:00', '2025-03-17 20:00:00', '2025-03-17 20:45:00',
 12, 187, 25, true, 'MA-2501', '2025-02-01 00:00:00'),

('a0000001-0000-0000-0000-000000000002',
 'Important Jewels: The Palm Beach Collection',
 'Featuring Natural Fancy Color Diamonds',
 'Rare and important jewels from an esteemed Palm Beach estate, featuring Art Deco and signed pieces.',
 'important-jewels-palm-beach-2025', 'timed', 'completed',
 '2025-04-05 10:00:00', '2025-04-07 18:00:00', '2025-04-07 18:30:00',
 10, 142, 25, true, 'JW-2502', '2025-03-01 00:00:00'),

('a0000001-0000-0000-0000-000000000003',
 'Fine Antiques & European Decorative Arts',
 'Including Property from a Distinguished Park Avenue Residence',
 'Important English and French furniture, porcelain, silver, and decorative objects from the 17th through 19th centuries.',
 'fine-antiques-european-decorative-2025', 'timed', 'completed',
 '2025-05-10 12:00:00', '2025-05-12 20:00:00', '2025-05-12 20:15:00',
 10, 98, 25, false, 'AN-2503', '2025-04-10 00:00:00'),

-- Summer 2025 Sales
('a0000001-0000-0000-0000-000000000004',
 'Luxury Watches: Summer Edition',
 'Rare Patek Philippe, Rolex & Audemars Piguet',
 'Featuring museum-quality timepieces from the golden era of Swiss watchmaking alongside contemporary icons.',
 'luxury-watches-summer-2025', 'timed', 'completed',
 '2025-06-20 10:00:00', '2025-06-22 18:00:00', '2025-06-22 18:45:00',
 10, 203, 25, true, 'LW-2504', '2025-05-20 00:00:00'),

('a0000001-0000-0000-0000-000000000005',
 'Haute Couture & Vintage Fashion',
 'From the Wardrobes of Style Icons',
 'Exceptional vintage pieces from Chanel, Hermès, Dior, and Yves Saint Laurent spanning five decades of fashion history.',
 'haute-couture-vintage-fashion-2025', 'timed', 'completed',
 '2025-07-08 14:00:00', '2025-07-10 20:00:00', '2025-07-10 20:30:00',
 10, 115, 25, false, 'FA-2505', '2025-06-08 00:00:00'),

-- Fall 2025 Sales
('a0000001-0000-0000-0000-000000000006',
 '20th Century Design: Icons of Modernism',
 'From Bauhaus to Memphis',
 'An extraordinary collection of 20th century design including furniture, lighting, and objects by the most important designers of the modern era.',
 '20th-century-design-icons-2025', 'timed', 'completed',
 '2025-09-15 10:00:00', '2025-09-17 18:00:00', '2025-09-17 18:20:00',
 10, 134, 25, true, 'DS-2506', '2025-08-15 00:00:00'),

-- Upcoming / Preview Auctions
('a0000001-0000-0000-0000-000000000007',
 'Impressionist & Modern Art: Spring 2026',
 'The Pinnacle of European Modernism',
 'An exceptional offering of works by Monet, Picasso, Matisse, and their contemporaries.',
 'impressionist-modern-art-spring-2026', 'timed', 'preview',
 '2026-03-20 14:00:00', '2026-03-22 20:00:00', NULL,
 8, 0, 25, true, 'IM-2601', '2026-02-15 00:00:00'),

('a0000001-0000-0000-0000-000000000008',
 'The Boca Raton Collection: Fine Jewelry',
 'Important Gems & Signed Pieces',
 'A lifetime collection of fine jewelry from a distinguished Boca Raton estate featuring signed Van Cleef & Arpels, Cartier, and Bulgari.',
 'boca-raton-jewelry-spring-2026', 'timed', 'scheduled',
 '2026-04-10 10:00:00', '2026-04-12 18:00:00', NULL,
 6, 0, 25, true, 'JW-2602', '2026-02-20 00:00:00'),

('a0000001-0000-0000-0000-000000000009',
 'Contemporary Art: New Voices',
 'Emerging & Mid-Career Artists',
 'A curated selection of works by the most exciting artists working today.',
 'contemporary-art-new-voices-2026', 'timed', 'scheduled',
 '2026-04-25 14:00:00', '2026-04-27 20:00:00', NULL,
 6, 0, 25, false, 'CA-2603', '2026-03-01 00:00:00');


-- ============================================
-- 3. AUCTION LOTS — ART (Spring 2025 Sale)
-- ============================================
INSERT INTO lots (id, title, subtitle, description, category_id, artist, period, circa, origin, medium, dimensions, condition, condition_notes, provenance, status, sale_type, estimate_low, estimate_high, reserve_price, starting_bid, current_bid_amount, bid_count, hammer_price, is_featured, slug, lot_number, created_at) VALUES

('10000001-0000-0000-0000-000000000001',
 'Composition in Blue and Gold',
 'A Masterwork of Gestural Abstraction',
 'This commanding canvas exemplifies the artist''s mature period, when bold chromatic experiments merged with an increasingly confident approach to spatial dynamics. Layers of cerulean, ultramarine, and gold leaf create a luminous surface that seems to pulse with internal light. The work demonstrates the artist''s mastery of color field painting while maintaining the gestural energy of abstract expressionism.',
 'c0000001-0000-0000-0000-000000000001', 'Elena Vasquez', 'Contemporary', 'circa 2019', 'United States', 'Oil and gold leaf on canvas', '72 x 60 inches (182.9 x 152.4 cm)', 'excellent', 'Minor surface dust. No visible craquelure. Stretcher bar in excellent condition.', 'Private Collection, Palm Beach, FL; Acquired from Gagosian Gallery, New York, 2020',
 'sold', 'auction', 12000000, 18000000, 10000000, 8000000, 15500000, 24, 15500000, true,
 'composition-blue-gold-vasquez', 1, '2025-02-01 00:00:00'),

('10000001-0000-0000-0000-000000000002',
 'Untitled (Red Series No. 7)',
 NULL,
 'A powerful example from the artist''s celebrated Red Series, this work radiates with an intensity that transcends its physical dimensions. The deep cadmium red ground is animated by subtle variations in tone and texture, revealing the artist''s painstaking process of building color through dozens of translucent layers.',
 'c0000001-0000-0000-0000-000000000001', 'Marcus Chen', 'Contemporary', '2021', 'United States', 'Acrylic on linen', '48 x 48 inches (121.9 x 121.9 cm)', 'mint', 'Perfect condition. Never exhibited.',  'Acquired directly from the artist''s studio, 2021',
 'sold', 'auction', 4000000, 6000000, 3500000, 3000000, 5200000, 18, 5200000, true,
 'untitled-red-series-7-chen', 2, '2025-02-01 00:00:00'),

('10000001-0000-0000-0000-000000000003',
 'Jardin de Luxembourg, Autumn',
 NULL,
 'A luminous plein-air painting capturing the golden light of autumn in Paris''s beloved Luxembourg Gardens. The artist''s impressionistic brushwork creates a shimmering surface that perfectly evokes the fleeting quality of seasonal light filtering through the trees.',
 'c0000001-0000-0000-0000-000000000001', 'Henri Beaumont', 'Post-Impressionist', 'circa 1928', 'France', 'Oil on canvas', '24 x 30 inches (61 x 76.2 cm)', 'very_good', 'Light craquelure consistent with age. Original stretcher. Professionally cleaned 2018.', 'Estate of Marguerite Beaumont, Paris; Thence by descent; Christie''s, Paris, 2015, lot 47; Private Collection, New York',
 'sold', 'auction', 8000000, 12000000, 7000000, 5000000, 9800000, 15, 9800000, true,
 'jardin-luxembourg-autumn-beaumont', 3, '2025-02-01 00:00:00'),

('10000001-0000-0000-0000-000000000004',
 'Bronze Figure: The Dancer',
 'Edition 3 of 8',
 'A graceful bronze sculpture capturing a dancer in mid-movement, the body arched in an elegant arabesque. The patinated surface reveals the artist''s masterful handling of form and light, creating a sense of weightlessness in solid bronze.',
 'c0000001-0000-0000-0000-000000000001', 'Isabella Fontana', 'Contemporary', '2018', 'Italy', 'Patinated bronze on marble base', '28 x 14 x 12 inches (71.1 x 35.6 x 30.5 cm)', 'excellent', 'Fine original patina. Minor wear to base. Certificate of authenticity included.', 'Acquired from Galleria d''Arte Moderna, Milan, 2019',
 'sold', 'auction', 3000000, 5000000, 2500000, 2000000, 4100000, 12, 4100000, false,
 'bronze-dancer-fontana', 4, '2025-02-01 00:00:00'),

('10000001-0000-0000-0000-000000000005',
 'Neon Skyline: Miami After Dark',
 NULL,
 'A vibrant large-scale work depicting Miami''s iconic skyline rendered in electric neon hues against a deep indigo night sky. The artist''s signature use of fluorescent pigments creates an otherworldly glow that seems to emanate from the canvas itself.',
 'c0000001-0000-0000-0000-000000000001', 'Diego Ramirez', 'Contemporary', '2023', 'United States', 'Fluorescent acrylic and spray paint on canvas', '60 x 96 inches (152.4 x 243.8 cm)', 'mint', 'Pristine condition. Gallery-wrapped edges.',  'Acquired from Art Basel Miami Beach, 2023',
 'sold', 'auction', 2000000, 3000000, 1800000, 1500000, 2800000, 9, 2800000, false,
 'neon-skyline-miami-ramirez', 5, '2025-02-01 00:00:00'),

-- More Art lots
('10000001-0000-0000-0000-000000000006',
 'Still Life with Anemones and Lemons',
 NULL,
 'A sumptuous still life in the tradition of the Dutch Golden Age masters, rendered with meticulous attention to the interplay of light on diverse surfaces. The deep crimson anemones set against acid-yellow lemons and a pewter vessel create a composition of extraordinary chromatic richness.',
 'c0000001-0000-0000-0000-000000000001', 'Clara van der Berg', 'Contemporary Realism', '2022', 'Netherlands', 'Oil on panel', '20 x 24 inches (50.8 x 61 cm)', 'excellent', 'Excellent condition throughout. Original frame.', 'Acquired from the artist''s solo exhibition, Amsterdam, 2022',
 'sold', 'auction', 1500000, 2500000, 1200000, 1000000, 2200000, 14, 2200000, false,
 'still-life-anemones-vanderberg', 6, '2025-02-01 00:00:00'),

('10000001-0000-0000-0000-000000000007',
 'Abstract Landscape: Pacific Coast',
 NULL,
 'An expansive canvas that distills the California coastline into pure fields of color — bands of sapphire, foam-white, and sun-bleached gold stretch horizontally across the surface, evoking the vast Pacific horizon without recourse to literal representation.',
 'c0000001-0000-0000-0000-000000000001', 'James Thornton', 'Contemporary', '2020', 'United States', 'Oil and wax on canvas', '48 x 72 inches (121.9 x 182.9 cm)', 'excellent', 'Excellent condition. Minor dust. Unframed.', 'Private Collection, Los Angeles',
 'sold', 'auction', 3500000, 5000000, 3000000, 2500000, 4600000, 11, 4600000, true,
 'abstract-landscape-pacific-thornton', 7, '2025-02-01 00:00:00'),

-- ============================================
-- JEWELRY LOTS (Palm Beach 2025 Sale)
-- ============================================
('10000001-0000-0000-0000-000000000010',
 'Art Deco Diamond and Platinum Bracelet',
 'Cartier, Paris, circa 1925',
 'A magnificent Art Deco bracelet composed of geometric links set with old European-cut diamonds totaling approximately 18.50 carats, accented by calibré-cut sapphires. The bracelet exemplifies the finest Art Deco craftsmanship with its clean lines and extraordinary stone quality.',
 'c0000001-0000-0000-0000-000000000005', 'Cartier', 'Art Deco', 'circa 1925', 'France', 'Platinum, diamonds, sapphires', '7 inches (17.8 cm) length', 'excellent', 'Excellent condition. All stones secure. Clasp functions perfectly. Minor surface wear consistent with age.', 'Estate of Mrs. Adelaide Worthington, Palm Beach; Thence by descent',
 'sold', 'auction', 15000000, 20000000, 12000000, 10000000, 17500000, 22, 17500000, true,
 'art-deco-diamond-bracelet-cartier', 1, '2025-03-01 00:00:00'),

('10000001-0000-0000-0000-000000000011',
 'Natural Fancy Vivid Yellow Diamond Ring',
 '12.03 Carats, VS1 Clarity',
 'An extraordinary cushion-cut Fancy Vivid Yellow diamond weighing 12.03 carats, VS1 clarity, set in a platinum and 18K yellow gold mounting with trapezoid-shaped white diamond shoulders. Accompanied by GIA report confirming natural color origin.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Contemporary', '2020', 'South Africa', 'Platinum, 18K gold, natural diamond', 'Ring size 6.5', 'mint', 'Unworn condition. Complete with original box and GIA certificate No. 2215987654.', 'Commissioned from a private jeweler, New York, 2020',
 'sold', 'auction', 30000000, 45000000, 28000000, 25000000, 38000000, 31, 38000000, true,
 'fancy-vivid-yellow-diamond-ring', 2, '2025-03-01 00:00:00'),

('10000001-0000-0000-0000-000000000012',
 'Van Cleef & Arpels Alhambra Necklace',
 'Vintage Long Necklace, 20 Motifs',
 'The iconic Alhambra long necklace in 18K yellow gold featuring twenty motifs set with mother-of-pearl, from Van Cleef & Arpels'' beloved Alhambra collection. A timeless piece that has become synonymous with everyday luxury.',
 'c0000001-0000-0000-0000-000000000005', 'Van Cleef & Arpels', 'Contemporary', '2022', 'France', '18K yellow gold, mother-of-pearl', '33.5 inches (85 cm) length', 'excellent', 'Light wear consistent with occasional use. All motifs intact.', 'Purchased from Van Cleef & Arpels, Worth Avenue, Palm Beach, 2022',
 'sold', 'auction', 2500000, 3500000, 2200000, 2000000, 3100000, 16, 3100000, false,
 'vca-alhambra-necklace-20motifs', 3, '2025-03-01 00:00:00'),

('10000001-0000-0000-0000-000000000013',
 'Colombian Emerald and Diamond Pendant',
 'Circa 8.50 Carat No-Oil Emerald',
 'A rare and important pendant centering an oval-shaped Colombian emerald of approximately 8.50 carats, no-oil, surrounded by a double halo of brilliant-cut white diamonds. The vivid, saturated green color and exceptional transparency make this an extraordinary stone.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Contemporary', '2019', 'Colombia', 'Platinum, emerald, diamonds', 'Pendant: 1.5 x 1 inch; Chain: 18 inches', 'mint', 'Unworn. Complete with Gübelin laboratory report confirming Colombian origin, no enhancement.', 'Private Collection, Miami',
 'sold', 'auction', 12000000, 18000000, 10000000, 8000000, 14200000, 19, 14200000, true,
 'colombian-emerald-pendant-no-oil', 4, '2025-03-01 00:00:00'),

-- ============================================
-- ANTIQUES LOTS (European Decorative 2025)
-- ============================================
('10000001-0000-0000-0000-000000000020',
 'Louis XV Ormolu-Mounted Kingwood Commode',
 'Attributed to Charles Cressent, circa 1740',
 'A superb Louis XV commode of serpentine form, veneered in kingwood and tulipwood with ormolu mounts of exceptional quality. The marble top is original, and the commode retains much of its original gilding. The fluid, rocaille-inspired mounts are characteristic of the finest ébénistes of the period.',
 'c0000001-0000-0000-0000-000000000002', 'Charles Cressent', 'Louis XV', 'circa 1740', 'France', 'Kingwood, tulipwood, ormolu, marble', '34 x 52 x 24 inches (86.4 x 132.1 x 61 cm)', 'very_good', 'Original marble top with minor chips to edges. Ormolu mounts retain approximately 80% of original gilding. Some veneer restoration to the sides. Structurally sound.', 'Collection of the Comte de Marcillac, Paris; Sold Hôtel Drouot, Paris, 1962; Private Collection, Park Avenue, New York',
 'sold', 'auction', 8000000, 12000000, 7000000, 5000000, 9500000, 11, 9500000, true,
 'louis-xv-commode-cressent', 1, '2025-04-10 00:00:00'),

('10000001-0000-0000-0000-000000000021',
 'George III Silver Epergne',
 'Thomas Pitts, London, 1773',
 'A magnificent George III silver epergne of grand scale, the central basket surmounted by a cast pineapple finial, supported on four scrolling branches with detachable baskets, raised on a shaped base with four shell and scroll feet.',
 'c0000001-0000-0000-0000-000000000002', 'Thomas Pitts', 'Georgian', '1773', 'England', 'Sterling silver', '24 inches (61 cm) height; approximately 180 troy ounces', 'very_good', 'Good condition overall. Fully hallmarked London 1773. Minor dents to one satellite basket. All branches and baskets present.', 'The Collection of Lord Harrowby, Sandon Hall, Staffordshire; Christie''s, London, 2008, lot 123',
 'sold', 'auction', 4000000, 6000000, 3500000, 3000000, 5100000, 8, 5100000, false,
 'george-iii-silver-epergne-pitts', 2, '2025-04-10 00:00:00'),

('10000001-0000-0000-0000-000000000022',
 'Meissen Porcelain Swan Service Tureen',
 'After the Model by Johann Joachim Kändler, circa 1740',
 'A rare Meissen porcelain tureen and cover from the celebrated Swan Service, the body modeled in low relief with swans among bulrushes, the cover surmounted by a swan finial. The Swan Service, originally created for Count Heinrich von Brühl, is among the most important porcelain services ever produced.',
 'c0000001-0000-0000-0000-000000000002', 'Johann Joachim Kändler', 'Baroque', 'circa 1740', 'Germany', 'Meissen hard-paste porcelain', '14 x 16 x 10 inches (35.6 x 40.6 x 25.4 cm)', 'good', 'Minor professional restoration to rim of cover. Small chip to one handle restored. Blue crossed swords mark to base.', 'Private European Collection; Sotheby''s, London, 2002',
 'sold', 'auction', 6000000, 9000000, 5000000, 4000000, 7200000, 13, 7200000, true,
 'meissen-swan-service-tureen', 3, '2025-04-10 00:00:00'),

-- ============================================
-- LUXURY / WATCHES (Summer 2025)
-- ============================================
('10000001-0000-0000-0000-000000000030',
 'Patek Philippe Ref. 5711/1A Nautilus',
 'Blue Dial, Full Set, Discontinued',
 'The legendary Patek Philippe Nautilus Reference 5711/1A-010 with the coveted blue sunburst dial. This discontinued icon of modern watchmaking features the caliber 26-330 S C self-winding movement and comes as a complete set with original box, papers, and receipt.',
 'c0000001-0000-0000-0000-000000000003', 'Patek Philippe', 'Contemporary', '2021', 'Switzerland', 'Stainless steel, sapphire crystal', '40mm case diameter', 'mint', 'Unworn condition. Complete with box, papers, original receipt. All stickers intact.', 'Purchased from authorized dealer, Geneva, 2021',
 'sold', 'auction', 12000000, 16000000, 11000000, 10000000, 14800000, 27, 14800000, true,
 'patek-philippe-nautilus-5711', 1, '2025-05-20 00:00:00'),

('10000001-0000-0000-0000-000000000031',
 'Rolex Daytona Ref. 6263 "Paul Newman"',
 'Exotic Dial, circa 1972',
 'An exceptional example of the highly coveted Rolex Cosmograph Daytona Reference 6263 featuring the exotic "Paul Newman" dial in cream with black sub-dials. The watch retains its original bezel, pushers, and crown, and the Valjoux 727 movement runs within COSC specifications.',
 'c0000001-0000-0000-0000-000000000003', 'Rolex', 'Vintage', 'circa 1972', 'Switzerland', 'Stainless steel', '37mm case diameter', 'very_good', 'Excellent original condition for age. Case shows minimal polishing. Original tritium lume has aged to a warm cream. Crystal replaced. Service history available.', 'Private Collection, Miami; Acquired from Phillips, New York, 2019',
 'sold', 'auction', 25000000, 35000000, 22000000, 20000000, 31000000, 34, 31000000, true,
 'rolex-daytona-6263-paul-newman', 2, '2025-05-20 00:00:00'),

('10000001-0000-0000-0000-000000000032',
 'Audemars Piguet Royal Oak Perpetual Calendar',
 'Ref. 26574ST, Blue Dial',
 'The Royal Oak Perpetual Calendar in stainless steel with a stunning blue "Grande Tapisserie" dial displaying day, date, month, moonphase, and leap year indicator. Powered by the caliber 5134 self-winding movement with 40-hour power reserve.',
 'c0000001-0000-0000-0000-000000000003', 'Audemars Piguet', 'Contemporary', '2023', 'Switzerland', 'Stainless steel, sapphire crystal', '41mm case diameter', 'excellent', 'Light wear consistent with occasional use. Complete with box, papers, AP service pouch.', 'Purchased from authorized dealer, New York, 2023',
 'sold', 'auction', 8000000, 11000000, 7000000, 6000000, 9500000, 19, 9500000, false,
 'ap-royal-oak-perpetual-26574', 3, '2025-05-20 00:00:00'),

('10000001-0000-0000-0000-000000000033',
 'Hermès Birkin 30 Himalaya Niloticus Crocodile',
 'Palladium Hardware, 2024',
 'The Holy Grail of handbags. The Hermès Birkin 30 in Himalaya Niloticus Crocodile with palladium hardware is the most sought-after handbag in the world. The graduated coloring from smoky grey to pearly white mimics the majestic Himalayan mountain range.',
 'c0000001-0000-0000-0000-000000000003', 'Hermès', 'Contemporary', '2024', 'France', 'Niloticus crocodile, palladium hardware', '30 x 22 x 16 cm', 'mint', 'Pristine, never carried. Complete with dustbag, clochette, keys, lock, rain jacket, box, and ribbon.', 'Purchased from Hermès, Faubourg Saint-Honoré, Paris, 2024',
 'sold', 'auction', 35000000, 50000000, 30000000, 28000000, 42000000, 38, 42000000, true,
 'hermes-birkin-30-himalaya', 4, '2025-05-20 00:00:00'),

-- ============================================
-- FASHION LOTS (Haute Couture 2025)
-- ============================================
('10000001-0000-0000-0000-000000000040',
 'Chanel Haute Couture Evening Gown',
 'Karl Lagerfeld, Fall/Winter 2015',
 'A breathtaking black silk organza evening gown with hand-embroidered sequin and crystal detail from Karl Lagerfeld''s penultimate collection for Chanel. The gown features a fitted bodice with off-shoulder neckline and a full, layered skirt with cascading ruffles. Each sequin was applied by hand by the artisans of Maison Lesage.',
 'c0000001-0000-0000-0000-000000000004', 'Karl Lagerfeld for Chanel', 'Haute Couture', '2015', 'France', 'Silk organza, sequins, crystals', 'Size FR 36 (US 4)', 'excellent', 'Excellent condition. All embroidery intact. Minor perspiration marks to lining professionally addressed. Chanel haute couture label present.', 'Collection of a European Society Figure',
 'sold', 'auction', 3000000, 5000000, 2500000, 2000000, 3800000, 14, 3800000, false,
 'chanel-couture-evening-gown-lagerfeld', 1, '2025-06-08 00:00:00'),

('10000001-0000-0000-0000-000000000041',
 'Hermès Kelly 28 Sellier Ostrich',
 'Terre Cuite, Gold Hardware, 2023',
 'The Hermès Kelly 28 Sellier in Terre Cuite ostrich leather with gold hardware. The Sellier construction with its clean, structured lines and external stitching represents the most formal and sought-after version of this iconic design.',
 'c0000001-0000-0000-0000-000000000004', 'Hermès', 'Contemporary', '2023', 'France', 'Ostrich leather, gold hardware', '28 x 22 x 10 cm', 'mint', 'Brand new, never used. All protective plastics in place. Complete with dustbag, clochette, keys, lock, shoulder strap, box, ribbon, receipt.', 'Purchased from Hermès, 2023',
 'sold', 'auction', 4500000, 6000000, 4000000, 3500000, 5500000, 21, 5500000, true,
 'hermes-kelly-28-ostrich-terre-cuite', 2, '2025-06-08 00:00:00'),

('10000001-0000-0000-0000-000000000042',
 'Vintage Yves Saint Laurent Le Smoking Tuxedo',
 'Haute Couture, Autumn/Winter 1966',
 'An extraordinarily rare and historically important Le Smoking tuxedo from Yves Saint Laurent''s groundbreaking 1966 collection that revolutionized women''s fashion. This museum-quality ensemble comprises a satin-trimmed grain de poudre wool jacket and matching trousers.',
 'c0000001-0000-0000-0000-000000000004', 'Yves Saint Laurent', 'Haute Couture', '1966', 'France', 'Grain de poudre wool, silk satin', 'Size FR 38 (US 6)', 'good', 'Good vintage condition. Minor moth repair to left sleeve professionally executed. Satin collar shows light wear. YSL haute couture label and atelier number intact.', 'Estate of Nan Kempner, New York; Thence by descent',
 'sold', 'auction', 8000000, 12000000, 7000000, 5000000, 10500000, 26, 10500000, true,
 'ysl-le-smoking-1966-couture', 3, '2025-06-08 00:00:00'),

-- ============================================
-- DESIGN LOTS (20th Century Design 2025)
-- ============================================
('10000001-0000-0000-0000-000000000050',
 'Charlotte Perriand "Bibliothèque" Bookcase',
 'Steph Simon Edition, circa 1958',
 'A rare and important Bibliothèque bookcase designed by Charlotte Perriand for Steph Simon. The oak structure with painted aluminum sliding doors in signature colors embodies the architect''s rational approach to living space and storage. This example comes from the apartment of a Perriand collaborator.',
 'c0000001-0000-0000-0000-000000000006', 'Charlotte Perriand', 'Mid-Century Modern', 'circa 1958', 'France', 'Oak, painted aluminum, steel', '83 x 88 x 14 inches (210.8 x 223.5 x 35.6 cm)', 'very_good', 'Original paint to doors with expected wear. Oak shelves show patina consistent with age. Structurally excellent.', 'The Apartment of Pierre Guariche, Paris; Private Collection, New York',
 'sold', 'auction', 10000000, 15000000, 9000000, 7000000, 12500000, 17, 12500000, true,
 'perriand-bibliotheque-steph-simon', 1, '2025-08-15 00:00:00'),

('10000001-0000-0000-0000-000000000051',
 'George Nakashima "Conoid" Bench',
 'With Provenance to the Nakashima Studio',
 'A magnificent Conoid bench in American black walnut with a dramatic free-edge slab and single rosewood butterfly joint. Accompanied by a letter of authentication from Mira Nakashima-Yarnall confirming production in the Nakashima Studio, New Hope, Pennsylvania.',
 'c0000001-0000-0000-0000-000000000006', 'George Nakashima', 'Mid-Century Modern', '1974', 'United States', 'American black walnut, rosewood', '32 x 84 x 36 inches (81.3 x 213.4 x 91.4 cm)', 'excellent', 'Excellent original condition. Beautiful natural patina. Original finish. One minor scratch to top.', 'Commissioned by the original owner, 1974; Private Collection, Pennsylvania',
 'sold', 'auction', 6000000, 9000000, 5000000, 4000000, 8200000, 14, 8200000, true,
 'nakashima-conoid-bench-1974', 2, '2025-08-15 00:00:00'),

('10000001-0000-0000-0000-000000000052',
 'Poul Henningsen PH Artichoke Pendant',
 'Early Production, Louis Poulsen, circa 1960',
 'An early production PH Artichoke pendant lamp designed by Poul Henningsen for Louis Poulsen. The twelve rows of hand-assembled copper leaves create the signature form that has become one of the most recognizable lighting designs of the 20th century.',
 'c0000001-0000-0000-0000-000000000006', 'Poul Henningsen', 'Mid-Century Modern', 'circa 1960', 'Denmark', 'Copper, chromium-plated steel', '27 inches (68.6 cm) diameter', 'very_good', 'Original copper finish with beautiful natural patina. All leaves present and properly aligned. Original canopy included. Rewired for US standards.', 'Private Collection, Copenhagen; Acquired 2012',
 'sold', 'auction', 2000000, 3000000, 1800000, 1500000, 2700000, 11, 2700000, false,
 'ph-artichoke-pendant-henningsen', 3, '2025-08-15 00:00:00'),

('10000001-0000-0000-0000-000000000053',
 'Ettore Sottsass "Carlton" Room Divider',
 'Memphis Milano, 1981',
 'The iconic Carlton room divider/bookshelf by Ettore Sottsass, produced by Memphis Milano in 1981. This totemic piece, with its plastic laminate surfaces in bold primary colors, is perhaps the single most recognizable design from the Memphis movement.',
 'c0000001-0000-0000-0000-000000000006', 'Ettore Sottsass', 'Postmodern', '1981', 'Italy', 'Wood, plastic laminate', '77 x 75 x 16 inches (195.6 x 190.5 x 40.6 cm)', 'good', 'Good condition. Minor edge wear to laminate. Light scratches to shelving surfaces. Original label present.', 'Collection of an Italian Architect, Milan',
 'sold', 'auction', 3500000, 5000000, 3000000, 2500000, 4300000, 15, 4300000, false,
 'sottsass-carlton-memphis', 4, '2025-08-15 00:00:00');


-- ============================================
-- 4. AUCTION_LOTS — Link lots to their auctions
-- ============================================
INSERT INTO auction_lots (auction_id, lot_id, lot_number, closing_at) VALUES
-- Spring 2025 Art
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000001', 1, '2025-03-17 20:00:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000002', 2, '2025-03-17 20:02:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000003', 3, '2025-03-17 20:04:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000004', 4, '2025-03-17 20:06:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000005', 5, '2025-03-17 20:08:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000006', 6, '2025-03-17 20:10:00'),
('a0000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000007', 7, '2025-03-17 20:12:00'),
-- Palm Beach Jewels
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000010', 1, '2025-04-07 18:00:00'),
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000011', 2, '2025-04-07 18:02:00'),
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000012', 3, '2025-04-07 18:04:00'),
('a0000001-0000-0000-0000-000000000002', '10000001-0000-0000-0000-000000000013', 4, '2025-04-07 18:06:00'),
-- Antiques
('a0000001-0000-0000-0000-000000000003', '10000001-0000-0000-0000-000000000020', 1, '2025-05-12 20:00:00'),
('a0000001-0000-0000-0000-000000000003', '10000001-0000-0000-0000-000000000021', 2, '2025-05-12 20:02:00'),
('a0000001-0000-0000-0000-000000000003', '10000001-0000-0000-0000-000000000022', 3, '2025-05-12 20:04:00'),
-- Watches & Luxury
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000030', 1, '2025-06-22 18:00:00'),
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000031', 2, '2025-06-22 18:02:00'),
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000032', 3, '2025-06-22 18:04:00'),
('a0000001-0000-0000-0000-000000000004', '10000001-0000-0000-0000-000000000033', 4, '2025-06-22 18:06:00'),
-- Fashion
('a0000001-0000-0000-0000-000000000005', '10000001-0000-0000-0000-000000000040', 1, '2025-07-10 20:00:00'),
('a0000001-0000-0000-0000-000000000005', '10000001-0000-0000-0000-000000000041', 2, '2025-07-10 20:02:00'),
('a0000001-0000-0000-0000-000000000005', '10000001-0000-0000-0000-000000000042', 3, '2025-07-10 20:04:00'),
-- Design
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000050', 1, '2025-09-17 18:00:00'),
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000051', 2, '2025-09-17 18:02:00'),
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000052', 3, '2025-09-17 18:04:00'),
('a0000001-0000-0000-0000-000000000006', '10000001-0000-0000-0000-000000000053', 4, '2025-09-17 18:06:00');


-- ============================================
-- 5. GALLERY (Buy Now) LOTS
-- ============================================
INSERT INTO lots (id, title, subtitle, description, category_id, artist, period, circa, origin, medium, dimensions, condition, condition_notes, provenance, status, sale_type, buy_now_price, estimate_low, estimate_high, is_featured, slug, created_at) VALUES

('20000001-0000-0000-0000-000000000001',
 'Venetian Glass Chandelier',
 'Murano, 12 Arms',
 'A stunning hand-blown Murano glass chandelier featuring twelve arms with crystal drops and gold-infused glass flowers. Each arm terminates in a candle-style light fitting. The warm gold tones and crystalline clarity create a magnificent centerpiece.',
 'c0000001-0000-0000-0000-000000000006', NULL, 'Contemporary', '2022', 'Italy', 'Hand-blown Murano glass, gold leaf', '36 inches diameter x 42 inches height', 'excellent', 'Excellent condition. Professionally wired for US standards. All glass elements intact. Minor dust.', 'Acquired from Venini showroom, Venice, 2022',
 'for_sale', 'gallery', 1850000, 1500000, 2500000, true,
 'venetian-glass-chandelier-murano', '2026-01-15 00:00:00'),

('20000001-0000-0000-0000-000000000002',
 'Art Deco Diamond Tennis Bracelet',
 '8.50 Total Carat Weight',
 'An elegant Art Deco-inspired tennis bracelet featuring 42 round brilliant-cut diamonds totaling approximately 8.50 carats, F-G color, VS clarity, set in platinum with milgrain detailing. The geometric links evoke the sophistication of the 1920s.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Art Deco Revival', '2023', 'United States', 'Platinum, diamonds', '7 inches (17.8 cm) length', 'mint', 'Unworn. Complete with appraisal and insurance documentation.', 'Private Collection, Boca Raton',
 'for_sale', 'gallery', 2200000, 1800000, 2800000, true,
 'art-deco-diamond-tennis-bracelet', '2026-01-20 00:00:00'),

('20000001-0000-0000-0000-000000000003',
 'Coastal Landscape: Morning Tide',
 NULL,
 'A serene and luminous seascape capturing the golden light of early morning along the Florida coast. Soft washes of peach, lavender, and aquamarine create an atmospheric composition that evokes the tranquility of dawn on the Atlantic.',
 'c0000001-0000-0000-0000-000000000001', 'Sarah Mitchell', 'Contemporary', '2024', 'United States', 'Oil on linen', '36 x 48 inches (91.4 x 121.9 cm)', 'mint', 'Pristine condition. Gallery-wrapped edges. Ready to hang.', 'Acquired from the artist''s studio, Palm Beach, 2024',
 'for_sale', 'gallery', 850000, 600000, 1200000, true,
 'coastal-landscape-morning-tide-mitchell', '2026-02-01 00:00:00'),

('20000001-0000-0000-0000-000000000004',
 'Hermès Constance 24 Epsom',
 'Gold, Palladium Hardware',
 'The coveted Hermès Constance 24 in Gold Epsom leather with palladium hardware. The Constance is one of Hermès'' most iconic and difficult-to-acquire designs, featuring the signature H-clasp closure.',
 'c0000001-0000-0000-0000-000000000004', 'Hermès', 'Contemporary', '2024', 'France', 'Epsom calfskin, palladium hardware', '24 x 15 x 6 cm', 'mint', 'Brand new, never carried. Complete with box, dustbag, receipt, care card.', 'Purchased from Hermès boutique, 2024',
 'for_sale', 'gallery', 1650000, 1400000, 2000000, false,
 'hermes-constance-24-gold-epsom', '2026-02-05 00:00:00'),

('20000001-0000-0000-0000-000000000005',
 'Pair of Mid-Century Brass Table Lamps',
 'After Gabriella Crespi',
 'An elegant pair of sculptural brass table lamps in the manner of Gabriella Crespi, featuring organic bamboo-form stems with original silk shades. The warm brass finish has developed a beautiful natural patina.',
 'c0000001-0000-0000-0000-000000000006', NULL, 'Mid-Century Modern', 'circa 1970', 'Italy', 'Brass, silk', '28 inches height each', 'very_good', 'Original patina. Shades show minor age-related discoloration. Rewired. Working perfectly.', 'Private Collection, Miami',
 'for_sale', 'gallery', 480000, 350000, 650000, false,
 'mid-century-brass-lamps-crespi-style', '2026-02-10 00:00:00'),

('20000001-0000-0000-0000-000000000006',
 'Cartier Tank Française Watch',
 'Medium, Steel and Gold',
 'The timeless Cartier Tank Française in stainless steel and 18K yellow gold with a silver guilloché dial. Powered by a quartz movement. Complete with original box, papers, and Cartier warranty.',
 'c0000001-0000-0000-0000-000000000003', 'Cartier', 'Contemporary', '2022', 'Switzerland', 'Stainless steel, 18K yellow gold', '30 x 25 mm', 'excellent', 'Light wear. Crystal perfect. Bracelet in excellent condition with all original links.', 'Purchased from Cartier, Worth Avenue, Palm Beach, 2022',
 'for_sale', 'gallery', 520000, 400000, 650000, false,
 'cartier-tank-francaise-two-tone', '2026-02-15 00:00:00'),

('20000001-0000-0000-0000-000000000007',
 'Vintage Chanel Classic Flap Bag',
 'Medium, Black Lambskin, Gold Hardware',
 'The quintessential Chanel Classic Medium Double Flap bag in black lambskin leather with 24K gold-plated hardware. This vintage example from the early 1990s features the iconic interlocking CC turn-lock closure and woven chain strap.',
 'c0000001-0000-0000-0000-000000000004', 'Chanel', 'Vintage', 'circa 1994', 'France', 'Lambskin leather, 24K gold-plated hardware', '10 x 6 x 2.5 inches', 'very_good', 'Beautiful vintage condition. Lambskin is supple with light corner wear. Interior clean. Hardware retains good plating. Authenticity card and dustbag included.', 'Private Collection, Palm Beach',
 'for_sale', 'gallery', 780000, 600000, 950000, false,
 'vintage-chanel-classic-flap-black', '2026-02-18 00:00:00'),

('20000001-0000-0000-0000-000000000008',
 'Japanese Edo Period Bronze Vase',
 'Crane and Turtle Motif',
 'A finely cast and patinated Japanese bronze vase of archaic form, decorated in high relief with cranes in flight above stylized waves and a large turtle — symbols of longevity and good fortune. The dark chocolate patina is rich and undisturbed.',
 'c0000001-0000-0000-0000-000000000002', NULL, 'Edo Period', 'circa 1850', 'Japan', 'Patinated bronze', '18 inches (45.7 cm) height', 'very_good', 'Fine original patina. Minor surface abrasions consistent with age. Base signed with seal mark.', 'Private Collection, New York; Acquired from Sotheby''s, 2010',
 'for_sale', 'gallery', 420000, 300000, 550000, false,
 'japanese-edo-bronze-vase-crane', '2026-02-20 00:00:00');


-- ============================================
-- 6. PRIVATE SALE LOTS
-- ============================================
INSERT INTO lots (id, title, subtitle, description, category_id, artist, period, circa, origin, medium, dimensions, condition, condition_notes, provenance, status, sale_type, estimate_low, estimate_high, is_featured, slug, created_at) VALUES

('30000001-0000-0000-0000-000000000001',
 'Important Blue Period Watercolor',
 'A Museum-Quality Work on Paper',
 'An exceptional watercolor from the artist''s celebrated Blue Period, depicting a solitary figure in tones of cerulean and cobalt against a muted background. The work demonstrates the profound emotional depth and technical mastery that defined this pivotal artistic era. Full scholarly documentation available upon request.',
 'c0000001-0000-0000-0000-000000000001', 'School of Picasso', 'Modern', 'circa 1903', 'Spain', 'Watercolor and pencil on paper', '14 x 10 inches (35.6 x 25.4 cm)', 'very_good', 'Good condition for age. Foxing to margins, not affecting image. Archivally matted and framed. Full condition report available to qualified buyers.', 'Distinguished Private European Collection; Details available under NDA',
 'for_sale', 'private', 50000000, 80000000, true,
 'important-blue-period-watercolor', '2026-01-10 00:00:00'),

('30000001-0000-0000-0000-000000000002',
 'Kashmir Sapphire and Diamond Ring',
 'Approximately 15.80 Carats, Unheated',
 'An extraordinary cushion-cut Kashmir sapphire of approximately 15.80 carats, unheated, of the finest cornflower blue color, flanked by half-moon cut diamonds in a platinum mounting. Kashmir sapphires of this size, quality, and provenance appear at auction only a few times per decade.',
 'c0000001-0000-0000-0000-000000000005', NULL, 'Contemporary', '2018', 'Kashmir / India', 'Platinum, Kashmir sapphire, diamonds', 'Ring size 5.5', 'mint', 'Unworn. Accompanied by certificates from Gübelin, SSEF, and AGL confirming Kashmir origin and no thermal enhancement.', 'Acquired privately from a renowned Geneva jeweler, 2018. Full provenance disclosed to qualified buyers.',
 'for_sale', 'private', 100000000, 150000000, true,
 'kashmir-sapphire-ring-unheated', '2026-01-15 00:00:00'),

('30000001-0000-0000-0000-000000000003',
 '1967 Ferrari 275 GTB/4',
 'Matching Numbers, Ferrari Classiche Certified',
 'An exceptional and highly original example of the legendary Ferrari 275 GTB/4, widely considered one of the most beautiful grand tourers ever produced. This matching-numbers example retains its original Colombo V12 engine with six Weber carburetors, producing 300 horsepower. Finished in the original Rosso Chiaro over Nero leather.',
 'c0000001-0000-0000-0000-000000000003', 'Ferrari', 'Classic', '1967', 'Italy', 'Steel body, aluminum alloy engine', 'Wheelbase: 2400mm', 'excellent', 'Excellent condition throughout. Sympathetic restoration completed 2019. Ferrari Classiche Red Book certification. Complete tool roll and jack.', 'Two owners from new. Extensive documented history. Full ownership chain available to qualified buyers.',
 'for_sale', 'private', 300000000, 400000000, true,
 'ferrari-275-gtb4-1967-matching', '2026-02-01 00:00:00');


-- ============================================
-- 7. LOTS FOR UPCOMING AUCTIONS (preview/scheduled)
-- ============================================
INSERT INTO lots (id, title, subtitle, description, category_id, artist, period, circa, origin, medium, dimensions, condition, condition_notes, provenance, status, sale_type, estimate_low, estimate_high, reserve_price, starting_bid, is_featured, slug, lot_number, created_at) VALUES

-- Impressionist & Modern (Preview)
('40000001-0000-0000-0000-000000000001',
 'Water Lilies Study',
 'A Luminous Late Work',
 'A captivating study of water lilies rendered with the artist''s characteristic broken brushwork and sensitivity to the play of light on water. The palette of blues, greens, and soft pinks creates a meditative atmosphere that invites prolonged contemplation.',
 'c0000001-0000-0000-0000-000000000001', 'After Claude Monet', 'Impressionist', 'circa 1920', 'France', 'Oil on canvas', '28 x 36 inches (71.1 x 91.4 cm)', 'very_good', 'Cleaned and relined. Original stretcher replaced. Minor inpainting to lower right corner.', 'Private Collection, Switzerland; Sotheby''s, London, 2005; Private Collection, New York',
 'in_auction', 'auction', 15000000, 25000000, 12000000, 10000000, true,
 'water-lilies-study-monet-school', 1, '2026-02-15 00:00:00'),

('40000001-0000-0000-0000-000000000002',
 'Femme au Chapeau Rouge',
 NULL,
 'A vibrant portrait study depicting a woman in a striking red hat, executed with bold, confident brushstrokes and a vivid palette. The work captures the joie de vivre of Parisian café culture in the early 20th century.',
 'c0000001-0000-0000-0000-000000000001', 'School of Matisse', 'Fauve', 'circa 1907', 'France', 'Oil on canvas', '24 x 20 inches (61 x 50.8 cm)', 'good', 'Surface cleaned. Minor craquelure. Old restoration to upper left visible under UV.', 'Estate of a Parisian Collector; Private Collection, London',
 'in_auction', 'auction', 8000000, 12000000, 7000000, 5000000, true,
 'femme-chapeau-rouge-matisse-school', 2, '2026-02-15 00:00:00'),

-- Boca Raton Jewelry (Scheduled)
('40000001-0000-0000-0000-000000000003',
 'Bulgari Serpenti Necklace',
 '18K Gold and Diamonds',
 'The iconic Bulgari Serpenti necklace in 18K rose gold, the snake''s body set with pavé diamonds and the eyes accented by emerald cabochons. A powerful symbol of seduction and transformation.',
 'c0000001-0000-0000-0000-000000000005', 'Bulgari', 'Contemporary', '2023', 'Italy', '18K rose gold, diamonds, emeralds', '16 inches (40.6 cm) length', 'mint', 'Unworn. Complete with Bulgari box, certificate, and receipt.', 'Purchased from Bulgari, Bal Harbour, 2023',
 'in_auction', 'auction', 4500000, 6500000, 4000000, 3500000, true,
 'bulgari-serpenti-necklace-rose-gold', 1, '2026-02-20 00:00:00'),

('40000001-0000-0000-0000-000000000004',
 'Tiffany & Co. Schlumberger Bracelet',
 'Enamel and Gold, circa 1970',
 'A rare and collectible bracelet by Jean Schlumberger for Tiffany & Co., featuring alternating panels of vivid blue paillonné enamel and 18K yellow gold set with round brilliant diamonds. Schlumberger''s exuberant designs are among the most collectible in American jewelry.',
 'c0000001-0000-0000-0000-000000000005', 'Jean Schlumberger for Tiffany & Co.', 'Vintage', 'circa 1970', 'United States', '18K yellow gold, enamel, diamonds', '7 inches (17.8 cm) length', 'excellent', 'Excellent vintage condition. Enamel intact with no chips. All diamonds present. Tiffany & Co. marks.', 'Estate of a Boca Raton Collector; Thence by descent',
 'in_auction', 'auction', 3000000, 5000000, 2500000, 2000000, false,
 'schlumberger-tiffany-bracelet-enamel', 2, '2026-02-20 00:00:00');


-- Link upcoming lots to their auctions
INSERT INTO auction_lots (auction_id, lot_id, lot_number, closing_at) VALUES
('a0000001-0000-0000-0000-000000000007', '40000001-0000-0000-0000-000000000001', 1, '2026-03-22 20:00:00'),
('a0000001-0000-0000-0000-000000000007', '40000001-0000-0000-0000-000000000002', 2, '2026-03-22 20:02:00'),
('a0000001-0000-0000-0000-000000000008', '40000001-0000-0000-0000-000000000003', 1, '2026-04-12 18:00:00'),
('a0000001-0000-0000-0000-000000000008', '40000001-0000-0000-0000-000000000004', 2, '2026-04-12 18:02:00');
