/**
 * Microsite definitions — one per city domain.
 *
 * These are NOT templated city pages. Google treats near-identical pages
 * spun up across many domains as doorway pages, and three of these four
 * sites sit inside a single county (Delray Beach, Jupiter and West Palm
 * Beach are all within ~30 miles of each other). The only thing that keeps
 * them out of that bucket is genuine, non-interchangeable content: real
 * neighbourhoods, a collecting specialism that actually distinguishes the
 * town, and realized prices pulled live from our own sold lots.
 *
 * Anything with a REVIEW marker is an operational claim that must be
 * confirmed by the business before the site goes live — do not invent
 * pickup frequencies, fee terms or service guarantees here.
 */

export type ServiceModel = 'local' | 'scheduled';

export interface Specialty {
  title: string;
  blurb: string;
  /** Category slugs (see scripts/seed-categories.ts) used to pull realized prices. */
  categories: string[];
}

export interface MicrositeFaq {
  q: string;
  a: string;
}

export interface Microsite {
  /** Route segment under /sites and the key used for lead attribution. */
  slug: string;
  /** Bare host, no protocol. Matched against the request Host header. */
  domain: string;
  city: string;
  state: string;
  region: string;
  /** Wordmark shown in the microsite nav. */
  brand: string;
  hero: {
    eyebrow: string;
    headline: string;
    sub: string;
  };
  /** Real neighbourhoods — these are what make the page locally specific. */
  neighborhoods: string[];
  /** Towns this site legitimately covers. Feeds LocalBusiness areaServed. */
  nearby: string[];
  serviceModel: ServiceModel;
  /** REVIEW: operational promise shown above the form. Confirm before launch. */
  serviceCopy: string;
  /** One or two paragraphs on why this town specifically. Unique per site. */
  localAngle: string[];
  specialties: Specialty[];
  /** Category slugs whose sold lots headline the realized-prices section. */
  leadCategories: string[];
  faqs: MicrositeFaq[];
}

export const MICROSITES: Microsite[] = [
  {
    slug: 'delray-beach',
    domain: 'delraybeachauctions.com',
    city: 'Delray Beach',
    state: 'FL',
    region: 'Palm Beach County',
    brand: 'Mayells Delray Beach',
    hero: {
      eyebrow: 'Estate auctions · Delray Beach, Florida',
      headline: 'Settling a house in Delray Beach',
      sub:
        'Most Delray estates are not a single painting — they are a whole house, and a family with a closing date. ' +
        'We appraise the contents, take what will sell at auction, and tell you plainly what will not.',
    },
    neighborhoods: [
      'Lake Ida',
      'Del-Ida Park',
      'Tropic Isle',
      'Seagate',
      'Pineapple Grove',
      'Atlantic Avenue',
      'Delray Beach Club',
    ],
    nearby: ['Boynton Beach', 'Highland Beach', 'Gulf Stream', 'Ocean Ridge', 'Boca Raton', 'Lantana'],
    serviceModel: 'local',
    // REVIEW: mirrors the commitment already published on mayells.com/consign
    // ("we come to you for complimentary appraisals and item pickup").
    serviceCopy:
      'Delray is twenty minutes from our Palm Beach County base. We come to the house for the appraisal, ' +
      'at no charge, and handle pickup ourselves.',
    localAngle: [
      'Delray splits into two very different estates. West of Military Trail the club and 55+ communities — ' +
        'Seven Bridges, Mizner Country Club, the Villages of Oriole — turn over constantly as owners move to ' +
        'assisted living or the family sells after a death. Those houses are full: furniture, silver service, ' +
        'costume jewelry, decades of collecting, and almost always a deadline attached to a closing.',
      'East of Swinton, the older houses in Lake Ida, Del-Ida Park and Seagate are a different proposition. ' +
        'These are 1920s–1950s Florida houses whose owners bought seriously and locally, and they are where the ' +
        'Highwaymen paintings, the good mid-century furniture and the signed jewelry actually surface.',
    ],
    specialties: [
      {
        title: 'Whole-house estate contents',
        blurb:
          'Furniture, silver, china, rugs, art and the contents of every closet — catalogued as one consignment ' +
          'rather than cherry-picked, so the house is actually cleared.',
        categories: ['antiques', 'design'],
      },
      {
        title: 'Florida Highwaymen & Florida landscape',
        blurb:
          'The Fort Pierce painters sold door-to-door along A1A for decades, which is exactly why they still come ' +
          'out of Delray houses. Unsigned boards are routinely misidentified — we authenticate before estimating.',
        categories: ['art'],
      },
      {
        title: 'Costume and signed jewelry',
        blurb:
          'Trifari, Schreiner, Miriam Haskell and the signed mid-century pieces that get mistaken for junk in a ' +
          'dresser drawer, alongside estate gold and stones.',
        categories: ['jewelry'],
      },
      {
        title: 'Mid-century furniture and design',
        blurb:
          'The Danish and American modern pieces bought new in the sixties and seventies and never moved since.',
        categories: ['design'],
      },
    ],
    leadCategories: ['antiques', 'art', 'jewelry', 'design'],
    faqs: [
      {
        q: 'We have to clear the house by a closing date. How fast can you move?',
        a:
          'Tell us the date when you call. A walk-through appraisal is usually scheduled within a few days, and ' +
          'pickup is arranged around your closing rather than our catalogue schedule.',
      },
      {
        q: 'What happens to the things that are not worth auctioning?',
        a:
          'We tell you so directly instead of taking them. For the remainder we will point you at donation and ' +
          'clearance options — an honest no on eighty percent of a house is what makes the other twenty worth selling.',
      },
      {
        q: 'Do you buy outright, or only sell on consignment?',
        a:
          'Primarily consignment, because it almost always returns more to the family. Where a deadline makes ' +
          'that impractical we will discuss a direct purchase for part of the estate.',
      },
    ],
  },

  {
    slug: 'jupiter',
    domain: 'jupiterauctions.com',
    city: 'Jupiter',
    state: 'FL',
    region: 'Northern Palm Beach County',
    brand: 'Mayells Jupiter',
    hero: {
      eyebrow: 'Estate auctions · Jupiter, Florida',
      headline: 'Jupiter estates are built on water and golf',
      sub:
        'Sportfishing pictures, ship models, club silver, tackle and watches. The things that matter in a Jupiter ' +
        'house are not what a general estate liquidator knows how to value.',
    },
    neighborhoods: [
      'Admirals Cove',
      'Jupiter Inlet Colony',
      'Jupiter Island',
      'Loxahatchee River',
      'Abacoa',
      'Tequesta',
    ],
    nearby: ['Tequesta', 'Juno Beach', 'Palm Beach Gardens', 'North Palm Beach', 'Hobe Sound', 'Singer Island'],
    serviceModel: 'local',
    // REVIEW: same published commitment as Delray — confirm before launch.
    serviceCopy:
      'Jupiter, Tequesta and Hobe Sound are inside our regular service area. Appraisals happen at the house, ' +
      'at no charge, and we handle collection.',
    localAngle: [
      'The money in Jupiter and Tequesta came off the water and off the course, and the estates reflect it. ' +
        'Admirals Cove and Jupiter Inlet Colony houses hold sportfishing art, half-hull and builder ship models, ' +
        'club trophies and tournament silver, vintage tackle, and the watches that went with all of it.',
      'These are the categories most often undervalued in a general estate sale. A Stanley Meltzoff canvas and a ' +
        'decorative marine reproduction look similar on a wall and are separated by two orders of magnitude at ' +
        'auction. The same is true of a pre-war Hardy reel against a shelf of ordinary tackle.',
    ],
    specialties: [
      {
        title: 'Sportfishing and marine art',
        blurb:
          'Meltzoff, Guy Harvey, Kent Ullberg bronzes and the mid-century marine painters. Attribution and ' +
          'edition matter enormously here and are the first thing we check.',
        categories: ['art'],
      },
      {
        title: 'Ship models, instruments and nautical antiques',
        blurb:
          'Builder and half-hull models, chronometers, sextants, binnacles and yacht-club silver — including ' +
          'trophies with real regatta provenance.',
        categories: ['antiques'],
      },
      {
        title: 'Watches and men’s jewelry',
        blurb:
          'Rolex, Patek, Omega and the dive and chronograph references that turn up in Jupiter drawers, plus ' +
          'signet rings, cufflinks and club pieces.',
        categories: ['luxury', 'jewelry'],
      },
      {
        title: 'Golf memorabilia and vintage tackle',
        blurb:
          'Pre-war clubs, club championship trophies, signed material, and the Hardy and Fin-Nor reels that are ' +
          'worth many times what the rest of the garage is.',
        categories: ['antiques', 'luxury'],
      },
    ],
    leadCategories: ['art', 'luxury', 'antiques', 'jewelry'],
    faqs: [
      {
        q: 'How do you value a sportfishing painting?',
        a:
          'By artist, medium and whether it is an original or one of the large signed editions. We check the ' +
          'auction record for that specific artist before giving you a range, and we will tell you when a piece ' +
          'is a decorative print rather than an original.',
      },
      {
        q: 'Is a ship model actually worth anything?',
        a:
          'It depends entirely on whether it is a builder or presentation model with documented provenance or a ' +
          'decorative reproduction. The difference is visible in the construction, and it is worth having someone ' +
          'look before the model goes in a donation pile.',
      },
      {
        q: 'Do you handle the watches separately?',
        a:
          'Yes. Watches are catalogued individually with condition and service history noted, because the buyers ' +
          'for them are not the buyers for the rest of the house.',
      },
    ],
  },

  {
    slug: 'west-palm-beach',
    domain: 'westpalmauctions.com',
    city: 'West Palm Beach',
    state: 'FL',
    region: 'Palm Beach County',
    brand: 'Mayells West Palm Beach',
    hero: {
      eyebrow: 'Estate auctions · West Palm Beach, Florida',
      headline: 'The county’s trade has always been on Antique Row',
      sub:
        'Estate jewelry, silver, European furniture and the Palm Beach Regency look. We are on the mainland side ' +
        'of the bridges, where the dealers are.',
    },
    neighborhoods: [
      'Antique Row (South Dixie)',
      'El Cid',
      'Flamingo Park',
      'Grandview Heights',
      'Northwood Village',
      'SoSo',
      'Prospect Park',
    ],
    nearby: ['Palm Beach', 'Lake Worth Beach', 'Palm Beach Gardens', 'Wellington', 'Royal Palm Beach', 'Lantana'],
    serviceModel: 'local',
    // REVIEW: WPB is the operational hub — confirm how this is phrased publicly.
    serviceCopy:
      'West Palm Beach is our home market. Appraisals at the house, at no charge, usually within the week.',
    localAngle: [
      'South Dixie Highway has been the county’s dealer corridor for decades, and that concentration is the ' +
        'reason West Palm values differently than the towns around it. There is a resident trade here that knows ' +
        'what a Regency lacquer cabinet or a set of Georgian silver is actually worth, and an estate sold into ' +
        'that market does not need to travel to find its buyer.',
      'The housing stock matters too. El Cid, Flamingo Park and Grandview Heights are full of 1920s Mizner-era ' +
        'and Mediterranean Revival houses, and their contents are now reaching market as the families of the ' +
        'original long-term owners sell. That is where the European furniture, the good silver and the ' +
        'Palm Beach Regency pieces come from.',
    ],
    specialties: [
      {
        title: 'Estate jewelry and silver',
        blurb:
          'Signed period jewelry, diamonds, and flatware and hollowware services — graded, weighed and ' +
          'catalogued piece by piece rather than sold as scrap.',
        categories: ['jewelry', 'luxury'],
      },
      {
        title: 'Palm Beach Regency',
        blurb:
          'Faux bamboo, lacquer, chinoiserie, Dorothy Draper and the Hollywood Regency vocabulary that this ' +
          'county effectively invented and that is being bought hard again.',
        categories: ['design', 'antiques'],
      },
      {
        title: 'European furniture and decorative arts',
        blurb:
          'Continental and English period furniture, porcelain, bronzes and clocks out of the Mizner-era houses ' +
          'in El Cid and Flamingo Park.',
        categories: ['antiques'],
      },
      {
        title: 'Fine art and Asian works',
        blurb:
          'Paintings, works on paper and sculpture, plus the Chinese and Japanese material that came into these ' +
          'houses through the mid-century trade.',
        categories: ['art'],
      },
    ],
    leadCategories: ['jewelry', 'antiques', 'design', 'art'],
    faqs: [
      {
        q: 'Should I take silver to a buyer on Antique Row or send it to auction?',
        a:
          'If it is unmarked or damaged, weight is most of the value and a direct sale is reasonable. If it is ' +
          'marked — Georgian, American coin, a named maker, a complete service — auction has consistently ' +
          'returned more than melt, and we will tell you which one you have before you decide.',
      },
      {
        q: 'Is Hollywood Regency furniture selling?',
        a:
          'Yes, and strongly for documented pieces. The market separates sharply between attributable work and ' +
          'generic period furniture in the same idiom, so provenance and labels are worth finding before sale.',
      },
      {
        q: 'Can you handle a full Mizner-era house?',
        a:
          'Yes — including oversized furniture, architectural elements and light fixtures, which need to be ' +
          'assessed in place rather than photographed and guessed at.',
      },
    ],
  },

  {
    slug: 'winter-park',
    domain: 'winterparkauctions.com',
    city: 'Winter Park',
    state: 'FL',
    region: 'Orlando, Orange County',
    brand: 'Mayells Winter Park',
    hero: {
      eyebrow: 'Estate auctions · Winter Park, Florida',
      headline: 'A Tiffany town, and it shows in the estates',
      sub:
        'Leaded glass, American art pottery and decorative arts surface in Winter Park houses at a rate nowhere ' +
        'else in Florida matches. There is a reason for that, and it is four blocks from Park Avenue.',
    },
    neighborhoods: [
      'Park Avenue',
      'The Vias',
      'Isle of Sicily',
      'Interlachen',
      'Windsong',
      'Lake Osceola',
      'Winter Park Chain of Lakes',
    ],
    nearby: ['Maitland', 'Baldwin Park', 'College Park', 'Windermere', 'Longwood', 'Altamonte Springs'],
    serviceModel: 'scheduled',
    // REVIEW: Winter Park is ~170 miles from the Palm Beach County base and
    // sits OUTSIDE the South Florida / NYC service area published on the main
    // site. Confirm the actual Central Florida arrangement before launch —
    // do not imply a local office that does not exist.
    serviceCopy:
      'We are a Palm Beach County house, not an Orlando one. Central Florida is served by scheduled collection ' +
      'trips, and we will give you a real date when you call rather than imply we are around the corner.',
    localAngle: [
      'The Charles Hosmer Morse Museum on Park Avenue holds the most comprehensive collection of Tiffany glass ' +
        'anywhere, assembled from the Laurelton Hall salvage. Three generations of Winter Park collectors formed ' +
        'their taste in that building, and the result is a town whose estates contain leaded glass, lamps, ' +
        'pottery and American decorative arts far out of proportion to its size.',
      'Rollins College and the Park Avenue galleries reinforced it. What comes out of houses in the Vias, ' +
        'Interlachen and the Isle of Sicily is not generic Florida estate contents — it is American art pottery, ' +
        'studio metalwork, period silver and pictures bought with an eye.',
    ],
    specialties: [
      {
        title: 'Leaded glass and lighting',
        blurb:
          'Tiffany Studios, Handel, Duffner & Kimberly and the better unsigned leaded shades. Signature, ' +
          'patination and the shade-to-base pairing are what separate four figures from six.',
        categories: ['design', 'antiques'],
      },
      {
        title: 'American art pottery',
        blurb:
          'Rookwood, Newcomb College, Van Briggle, Weller and Roseville — marked, dated and attributed to the ' +
          'decorator where the cipher allows it.',
        categories: ['antiques', 'design'],
      },
      {
        title: 'American decorative arts and silver',
        blurb:
          'Arts and Crafts metalwork, period furniture, and American silver from the houses around the Chain of ' +
          'Lakes.',
        categories: ['antiques', 'jewelry'],
      },
      {
        title: 'Fine art and works on paper',
        blurb:
          'The paintings, prints and drawings bought through the Park Avenue galleries and out of Rollins ' +
          'connections over the last sixty years.',
        categories: ['art'],
      },
    ],
    leadCategories: ['antiques', 'design', 'art', 'jewelry'],
    faqs: [
      {
        q: 'Are you actually located in Winter Park?',
        a:
          'No. Mayells is based in Palm Beach County and serves Central Florida through scheduled collection ' +
          'trips. We would rather say that plainly than list an address we do not keep staff at.',
      },
      {
        q: 'How do I know whether a lamp is really Tiffany?',
        a:
          'Signature is the start and not the end — bases and shades were separated and recombined for a century, ' +
          'and there are good period contemporaries worth real money in their own right. Photographs of the ' +
          'shade, the base, and any stamps will usually let us tell you before anyone travels.',
      },
      {
        q: 'Is it worth shipping a consignment to a Palm Beach auction?',
        a:
          'For art pottery, glass and jewelry, almost always — they travel well and the buyer pool is national ' +
          'regardless of where the sale is held. For a house full of large furniture the arithmetic is different, ' +
          'and we will say so.',
      },
    ],
  },
];

const BY_SLUG = new Map(MICROSITES.map((m) => [m.slug, m]));
const BY_DOMAIN = new Map(MICROSITES.map((m) => [m.domain, m]));

export function getMicrositeBySlug(slug: string): Microsite | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Resolve a request Host header to a microsite. Strips the port and any
 * `www.` prefix, so both apex and www variants of a domain resolve.
 */
export function getMicrositeByHost(host: string | null | undefined): Microsite | undefined {
  if (!host) return undefined;
  const bare = host.split(':')[0].toLowerCase().replace(/^www\./, '');
  return BY_DOMAIN.get(bare);
}

export const MICROSITE_SLUGS = MICROSITES.map((m) => m.slug);
export const MICROSITE_DOMAINS = MICROSITES.map((m) => m.domain);
