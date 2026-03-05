import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { outreachContacts } from '../src/db/schema/outreach';
import { sql } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const leads = [
  // ============================================
  // PALM BEACH ISLAND - BOUTIQUE FIRMS
  // ============================================
  {
    companyName: 'Doane and Doane, P.A.',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.doaneanddoane.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'West Palm Beach',
    state: 'FL',
    notes: 'Boutique firm, "Big law capabilities." One of Palm Beach County\'s most prominent tax, estate planning, trust, and probate firms. 25+ years. HNW clients throughout SE Florida.',
  },
  {
    companyName: 'Boyes, Farina & Matwiczyk',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://bfmlaw.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Palm Beach',
    state: 'FL',
    notes: 'All 3 partners Board Certified in Wills, Trusts & Estates by FL Bar. Recognized as top FL estate lawyers by nationally prestigious organizations. Premier boutique.',
  },
  {
    companyName: 'DeBellis Law, P.A.',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.debellislaw.com',
    category: 'elder_law' as const,
    source: 'Web research - boutique',
    city: 'West Palm Beach',
    state: 'FL',
    notes: 'Boutique firm. Elder Law, Estate Planning, Medicaid/Veterans Planning, Special Needs, Probate, Trust Admin, Guardianship.',
  },
  {
    companyName: 'Kitroser Lewis & Mighdoll',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.kitroserlaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'West Palm Beach',
    state: 'FL',
    notes: 'Palm Beach County. Estate planning, probate, trust litigation, elder law, financial exploitation, guardianship.',
  },
  {
    companyName: 'N. Morris Law, P.A.',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.nmorrislaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Palm Beach Gardens',
    state: 'FL',
    notes: 'Estate planning and probate. Palm Beach Gardens boutique firm.',
  },

  // ============================================
  // JUPITER ISLAND / HOBE SOUND - BOUTIQUE
  // ============================================
  {
    companyName: 'Law Offices of Marc R. Gaylord, P.A.',
    contactName: 'Marc R. Gaylord',
    title: 'Attorney',
    phone: '',
    website: 'https://marcgaylordlaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Hobe Sound',
    state: 'FL',
    notes: 'Families trust Marc Gaylord for critical estate planning decisions. 20+ years serving Treasure Coast. Real estate and estate planning. Hobe Sound, Jupiter Island, Stuart.',
  },
  {
    companyName: 'Kempe Law',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://kempelaw.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Jupiter',
    state: 'FL',
    notes: 'Focused on guarding your wealth. FOUR DECADES of multigenerational relationships as family counsel. Jupiter, FL.',
  },
  {
    companyName: 'Kulas Law Group',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.kulaslaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Hobe Sound',
    state: 'FL',
    notes: 'Serves Hobe Sound community. Estate planning. St. Lucie County.',
  },
  {
    companyName: 'Steele Law',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://hobesoundlawyer.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Hobe Sound',
    state: 'FL',
    notes: 'Lawyer in Port St. Lucie, Palm Beach Gardens, and Hobe Sound.',
  },

  // ============================================
  // NAPLES (PORT ROYAL / PELICAN BAY) - BOUTIQUE
  // ============================================
  {
    companyName: 'Megan M. Kelly, Attorney at Law',
    contactName: 'Megan M. Kelly',
    title: 'Attorney, 20+ years',
    phone: '',
    website: 'https://www.meganmkellylaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: '20+ years. Serves Pelican Bay, Old Naples, Moorings. Wills and trusts. Helps clients navigate decisions with confidence.',
  },
  {
    companyName: 'Nici Law Firm',
    contactName: '',
    title: '',
    phone: '',
    website: 'http://www.nicilawfirm.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: '25+ years. Simplifies estate planning, probate, trust admin. Tailored solutions to protect assets across Naples.',
  },
  {
    companyName: 'Dickman Law Firm',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.dickmanlawfirm.org',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: '50+ years combined experience. Estate planning, family law, land use & zoning. Naples boutique.',
  },
  {
    companyName: 'Cummings & Lockwood - Naples',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.cl-law.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: 'Trust and estate planning. Boutique focus on private clients. Naples office.',
  },
  {
    companyName: 'Cresset - Naples Family Office',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://cressetcapital.com/locations/naples/',
    category: 'family_office' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: 'Family office and private wealth management. Naples office. Boutique multi-family office approach.',
  },
  {
    companyName: 'Moran Wealth Management',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://moranwm.com',
    category: 'wealth_management' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: 'Independent RIA based in Naples. Tailored portfolios and future-focused financial plans for individuals, families, institutions.',
  },
  {
    companyName: 'Crisci Private Wealth Management',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.crisciprivatewealth.com',
    category: 'wealth_management' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: 'Private wealth management boutique. Naples, FL.',
  },
  {
    companyName: 'Aksala Wealth Advisors',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.aksala.com',
    category: 'wealth_management' as const,
    source: 'Web research - boutique',
    city: 'Sarasota',
    state: 'FL',
    notes: 'Fiduciary financial advisors. Sarasota/Lakewood Ranch. Retirement, relocation to FL, multi-generational assets. Personal touch.',
  },
  {
    companyName: 'Finley Wealth Advisors',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://mywealthadvisor.com',
    category: 'wealth_management' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: 'Naples wealth management boutique firm.',
  },
  {
    companyName: 'Naples Wealth Planning',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://napleswealthplanning.com',
    category: 'wealth_management' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: 'Financial planning boutique. Naples focused.',
  },
  {
    companyName: 'JFS Wealth Advisors - Naples',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://jfswa.com/locations/naples-financial-advisor-southwest-florida/',
    category: 'wealth_management' as const,
    source: 'Web research - boutique',
    city: 'Naples',
    state: 'FL',
    notes: 'Southwest Florida wealth management. Naples financial advisor.',
  },

  // ============================================
  // VERO BEACH (ORCHID ISLAND / WINDSOR) - BOUTIQUE
  // ============================================
  {
    companyName: 'Law Offices of Glenn & Glenn',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://gglennlaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Vero Beach',
    state: 'FL',
    notes: 'Family firm. Downtown Vero Beach. 35+ years in Indian River, Brevard, St. Lucie Counties. Estate plans, probate, real estate.',
  },
  {
    companyName: 'Lauer Law, P.A.',
    contactName: 'Steve Lauer',
    title: 'CPA & Board-Certified in Taxation + Wills/Trusts/Estates',
    phone: '',
    website: 'https://www.verolaw.org',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Vero Beach',
    state: 'FL',
    notes: 'CPA and dual board-certified (Taxation + Wills/Trusts/Estates). Beyond standard probate firms. Indian River County specialist.',
  },
  {
    companyName: 'Collins Brown Barkett, Chartered',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.verolaw.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Vero Beach',
    state: 'FL',
    notes: 'Estate planning, wills, trusts. Vero Beach. Established firm.',
  },
  {
    companyName: 'Campione, Campione & Leonard, P.A.',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.cclverolaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Vero Beach',
    state: 'FL',
    notes: 'Family firm (Campione family). Vero Beach boutique. Estate planning.',
  },
  {
    companyName: 'David F. Albrecht, P.A.',
    contactName: 'David F. Albrecht',
    title: 'Attorney',
    phone: '',
    website: 'https://www.albrechtattorneyfla.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Vero Beach',
    state: 'FL',
    notes: 'Wills, trusts, estate planning. Serves Indian River County residents.',
  },
  {
    companyName: 'Gould Cooksey Fennell - Trusts & Estates',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://gouldcooksey.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Vero Beach',
    state: 'FL',
    notes: 'Most trusted firm in Vero Beach. Trusts, Estates & Tax team with extensive HNW experience. Customized solutions for HNW individuals and families.',
  },
  {
    companyName: 'Lulich & Attorneys',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.lulich.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Vero Beach',
    state: 'FL',
    notes: 'Vero Beach, Fort Pierce, Indian River, Treasure Coast estate planning.',
  },

  // ============================================
  // BOCA RATON - BOUTIQUE
  // ============================================
  {
    companyName: 'Gutter Chaves Josepher Rubin Forman Fleisher Miller P.A.',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://floridatax.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Boca Raton',
    state: 'FL',
    notes: 'Boutique firm. 12 attorneys. Tax, probate, trust, litigation, business. Senior attorneys 30+ years each. Estate, trust, probate admin, elder financial abuse, guardianship.',
  },
  {
    companyName: 'Huth, Pratt & Milhauser',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.hpmlawyers.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Boca Raton',
    state: 'FL',
    notes: 'Boca Raton. Wills, trusts, estates, asset protection, guardianship.',
  },
  {
    companyName: 'Shari B. Cohen, P.A.',
    contactName: 'Shari B. Cohen',
    title: 'Estate Planning Attorney',
    phone: '',
    website: 'https://www.bocaratonestatelawyer.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Boca Raton',
    state: 'FL',
    notes: 'Estate and trust administration, probate, elder law. Boca Raton boutique practice.',
  },

  // ============================================
  // DELRAY BEACH / HIGHLAND BEACH / GULF STREAM - BOUTIQUE
  // ============================================
  {
    companyName: 'Redgrave & Rosenthal LLP',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.redgraveandrosenthal.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Delray Beach',
    state: 'FL',
    notes: 'Earned trust of 10,000+ individuals and families. Long-tenured team. Delray Beach and Boca Raton. Estate planning, wills, trusts.',
  },
  {
    companyName: 'Solkoff Legal, P.A.',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://solkoff.com',
    category: 'elder_law' as const,
    source: 'Web research - boutique',
    city: 'Delray Beach',
    state: 'FL',
    notes: 'Estate planning practice. Delray Beach boutique elder law firm.',
  },
  {
    companyName: 'Law Office of Mary Alice Gwynn, PA',
    contactName: 'Mary Alice Gwynn',
    title: 'Attorney',
    phone: '',
    website: 'https://www.mgwynnlaw.com',
    category: 'elder_law' as const,
    source: 'Web research - boutique',
    city: 'Delray Beach',
    state: 'FL',
    notes: 'Unique background as nurse and attorney. Lifelong Delray Beach community member. Elder law, estate planning.',
  },

  // ============================================
  // CORAL GABLES / COCONUT GROVE / PINECREST - BOUTIQUE
  // ============================================
  {
    companyName: 'Yelen Yelen & Simon, P.A.',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.yelen-yelen.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Coral Gables',
    state: 'FL',
    notes: 'Family firm (Yelen family). 50+ years. Estate planning, probate, trust admin, guardianship, real estate. Coral Gables boutique.',
  },
  {
    companyName: 'Heller Espenkotter PLLC',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.hellerlawgroup.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Coconut Grove',
    state: 'FL',
    notes: 'Boutique firm in Coconut Grove. Personalized legal services. Local, national, international clients. Trust and estate lawyers.',
  },
  {
    companyName: 'Alain Roman Law',
    contactName: 'Alain Roman',
    title: 'Trusts & Estates Attorney',
    phone: '',
    website: 'https://alainromanlaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Miami',
    state: 'FL',
    notes: 'Trusts & estates attorney. Miami boutique practice. Serves Fisher Island, Star Island, Key Biscayne area.',
  },
  {
    companyName: 'EPGD Business Law',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.epgdlaw.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Miami',
    state: 'FL',
    notes: 'Trust and estate planning, asset protection. Individuals and families throughout South Florida and Miami-Dade.',
  },
  {
    companyName: 'Alexander Gil, PLLC',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.agilpllc.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Miami Beach',
    state: 'FL',
    notes: 'Miami Beach office. Wills, trusts, advance care planning. Boutique estate planning.',
  },
  {
    companyName: 'DJ Legal Group',
    contactName: '',
    title: '',
    phone: '(305) 402-4494',
    website: 'https://djlegalgroup.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Miami',
    state: 'FL',
    notes: 'Serves Star Island, Miami-Dade. Wills, trusts, estates, estate planning. Boutique.',
  },

  // ============================================
  // FORT LAUDERDALE - BOUTIQUE
  // ============================================
  {
    companyName: 'The Kelley Law Firm, P.L.',
    contactName: '',
    title: '',
    phone: '',
    website: '',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Fort Lauderdale',
    state: 'FL',
    notes: 'FOUR GENERATIONS of lawyers. Over 100 years practicing in Fort Lauderdale. Family firm. Wills, trusts, estates focus.',
  },
  {
    companyName: 'Decker & Campbell, PL',
    contactName: '',
    title: '',
    phone: '',
    website: '',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Fort Lauderdale',
    state: 'FL',
    notes: 'Boutique firm. Downtown Fort Lauderdale. Estate planning, family law, real estate litigation.',
  },
  {
    companyName: 'The Levy Firm PLLC',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.thelevyfirmpllc.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Fort Lauderdale',
    state: 'FL',
    notes: 'Trust & estate planning. Fort Lauderdale boutique.',
  },
  {
    companyName: 'Rose M. La Femina, P.A.',
    contactName: 'Rose M. La Femina',
    title: 'Board Certified, Wills/Trusts/Estates',
    phone: '',
    website: 'http://www.trustsandestatespro.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    address: '401 East Las Olas Blvd, Suite 1400',
    city: 'Fort Lauderdale',
    state: 'FL',
    notes: 'FL Bar Board Certified. Las Olas office. Estate planning, trust/estate admin, probate/trust litigation, tax.',
  },
  {
    companyName: 'Judy Barringer Bonevac, P.A.',
    contactName: 'Judy Barringer Bonevac',
    title: 'Attorney',
    phone: '',
    website: 'https://www.bonevaclaw.com',
    category: 'estate_attorney' as const,
    source: 'Web research - boutique',
    city: 'Fort Lauderdale',
    state: 'FL',
    notes: 'Estate planning, trusts & estate, business law. Fort Lauderdale boutique firm.',
  },

  // ============================================
  // SARASOTA / LONGBOAT KEY - BOUTIQUE
  // ============================================
  {
    companyName: 'Barnes Walker, Goethe, Perron, Shea, Johnson & Robinson',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://barneswalker.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Sarasota',
    state: 'FL',
    notes: 'Since 1995. Serves Longboat Key, Sarasota, surrounding areas. Wills, trusts, estates. Family-focused boutique.',
  },
  {
    companyName: 'Williams Parker',
    contactName: '',
    title: '',
    phone: '',
    website: 'https://www.williamsparker.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Sarasota',
    state: 'FL',
    notes: 'Since 1925. Served generations of established FL families. Respected estate planning practice. Boutique heritage.',
  },
  {
    companyName: 'Kevin Sanderson Law',
    contactName: 'Kevin Sanderson',
    title: 'Attorney',
    phone: '',
    website: 'https://www.floridataxlawyers.com',
    category: 'trust_estate_planning' as const,
    source: 'Web research - boutique',
    city: 'Sarasota',
    state: 'FL',
    notes: 'Serves West Central FL including Sarasota, Casey Key, Siesta Key, Longboat Key. Estate planning, tax.',
  },
];

async function seed() {
  const existing = await db.execute(sql`SELECT count(*) as cnt FROM outreach_contacts`);
  console.log(`Existing leads: ${existing[0].cnt}`);
  console.log(`Attempting to seed ${leads.length} boutique/family firm leads...`);

  let added = 0;
  let skipped = 0;
  for (const lead of leads) {
    const [dup] = await db.execute(
      sql`SELECT id FROM outreach_contacts WHERE company_name = ${lead.companyName} LIMIT 1`
    );
    if (dup) {
      skipped++;
      continue;
    }

    await db.insert(outreachContacts).values({
      companyName: lead.companyName,
      contactName: lead.contactName || null,
      title: lead.title || null,
      email: null,
      phone: lead.phone || null,
      website: lead.website || null,
      category: lead.category,
      source: lead.source,
      address: lead.address || null,
      city: lead.city || null,
      state: lead.state || null,
      notes: lead.notes || null,
    });
    added++;
  }

  const final = await db.execute(sql`SELECT count(*) as cnt FROM outreach_contacts`);
  console.log(`\nAdded: ${added}, Skipped (duplicates): ${skipped}`);
  console.log(`Total leads now: ${final[0].cnt}`);

  const cities = await db.execute(sql`SELECT city, count(*) as cnt FROM outreach_contacts GROUP BY city ORDER BY cnt DESC LIMIT 20`);
  console.log('\nTop 20 cities:');
  for (const r of cities) console.log(`  ${r.city}: ${r.cnt}`);

  const cats = await db.execute(sql`SELECT category, count(*) as cnt FROM outreach_contacts GROUP BY category ORDER BY cnt DESC`);
  console.log('\nBy category:');
  for (const r of cats) console.log(`  ${r.category}: ${r.cnt}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
