-- Mayells Seed Images: Add Unsplash images to all lots and auctions
-- Run AFTER seed.sql

-- ============================================
-- AUCTION COVER IMAGES
-- ============================================

-- Modern & Contemporary Art: Spring 2025
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000001';

-- Important Jewels: Palm Beach
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1515562141589-67f0d569b6f5?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000002';

-- Fine Antiques & European Decorative Arts
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000003';

-- Luxury Watches: Summer Edition
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000004';

-- Haute Couture & Vintage Fashion
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000005';

-- 20th Century Design: Icons of Modernism
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000006';

-- Impressionist & Modern Art: Spring 2026
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000007';

-- Boca Raton Fine Jewelry
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000008';

-- Contemporary Art: New Voices
UPDATE auctions SET cover_image_url = 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=1200&h=675&fit=crop' WHERE id = 'a0000001-0000-0000-0000-000000000009';


-- ============================================
-- ART LOT IMAGES
-- ============================================

-- Composition in Blue and Gold (abstract painting)
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000001';

-- Untitled (Red Series No. 7)
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1549490349-8643362247b5?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000002';

-- Jardin de Luxembourg, Autumn (impressionist landscape)
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000003';

-- Bronze Figure: The Dancer
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000004';

-- Neon Skyline: Miami After Dark
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000005';

-- Still Life with Anemones and Lemons
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000006';

-- Abstract Landscape: Pacific Coast
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000007';


-- ============================================
-- JEWELRY LOT IMAGES
-- ============================================

-- Art Deco Diamond and Platinum Bracelet (Cartier)
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000010';

-- Natural Fancy Vivid Yellow Diamond Ring
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000011';

-- Van Cleef & Arpels Alhambra Necklace
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1515562141589-67f0d569b6f5?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000012';

-- Colombian Emerald and Diamond Pendant
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000013';


-- ============================================
-- ANTIQUES LOT IMAGES
-- ============================================

-- Louis XV Commode (Cressent)
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000020';

-- George III Silver Epergne
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000021';

-- Meissen Swan Service Tureen
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000022';


-- ============================================
-- LUXURY / WATCHES LOT IMAGES
-- ============================================

-- Patek Philippe Nautilus 5711
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000030';

-- Rolex Daytona Paul Newman
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1548171915-e79a380a2a4b?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000031';

-- Audemars Piguet Royal Oak
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000032';

-- Hermès Birkin 30 Himalaya
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000033';


-- ============================================
-- FASHION LOT IMAGES
-- ============================================

-- Chanel Haute Couture Evening Gown
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1518622358385-8ea7d0794bf6?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000040';

-- Hermès Kelly 28 Ostrich
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000041';

-- YSL Le Smoking Tuxedo 1966
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000042';


-- ============================================
-- DESIGN LOT IMAGES
-- ============================================

-- Charlotte Perriand Bibliothèque
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1532372576444-dda954194ad0?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000050';

-- George Nakashima Conoid Bench
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000051';

-- Poul Henningsen PH Artichoke
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000052';

-- Ettore Sottsass Carlton
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '10000001-0000-0000-0000-000000000053';


-- ============================================
-- GALLERY (BUY NOW) LOT IMAGES
-- ============================================

-- Venetian Glass Chandelier
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1543198126-a8ad8e47fb22?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000001';

-- Art Deco Diamond Tennis Bracelet
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000002';

-- Coastal Landscape: Morning Tide
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000003';

-- Hermès Constance 24
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000004';

-- Mid-Century Brass Table Lamps
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000005';

-- Cartier Tank Française
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000006';

-- Vintage Chanel Classic Flap
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1600857062241-98e5dba7f214?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000007';

-- Japanese Edo Period Bronze Vase
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1528396518501-b53b689eb4e3?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000008';

-- Vintage Hermès Silk Scarf
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000009';

-- Art Deco Silver Cocktail Shaker
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000010';

-- Signed Contemporary Lithograph
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000011';

-- Antique Leather-Bound Library Set
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000012';

-- Vintage Lalique Crystal Bowl
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '20000001-0000-0000-0000-000000000013';


-- ============================================
-- PRIVATE SALE LOT IMAGES
-- ============================================

-- Important Blue Period Watercolor
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '30000001-0000-0000-0000-000000000001';

-- Kashmir Sapphire and Diamond Ring
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '30000001-0000-0000-0000-000000000002';

-- 1967 Ferrari 275 GTB/4
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '30000001-0000-0000-0000-000000000003';


-- ============================================
-- UPCOMING AUCTION LOT IMAGES
-- ============================================

-- Water Lilies Study
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '40000001-0000-0000-0000-000000000001';

-- Femme au Chapeau Rouge
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1578926288207-a90a5366759d?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '40000001-0000-0000-0000-000000000002';

-- Bulgari Serpenti Necklace
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '40000001-0000-0000-0000-000000000003';

-- Tiffany Schlumberger Bracelet
UPDATE lots SET primary_image_url = 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&h=1000&fit=crop', image_count = 1 WHERE id = '40000001-0000-0000-0000-000000000004';
