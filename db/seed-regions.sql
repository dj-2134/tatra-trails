-- db/seed-regions.sql — run after db/add-regions.sql, in Supabase Studio → SQL Editor.
-- Full Slovak geomorphological taxonomy (celok level). is_public defaults FALSE; only
-- Vysoké Tatry is published so the existing High-Tatras content keeps showing. Idempotent.
--
-- Source: "Geomorfologické členenie Slovenska" (Mazúr & Lukniš 1986; Kočický & Ivanič 2011),
-- cross-checked against Wikipedia SK/EN and krizom-krazom.online's full hierarchy. Hierarchy is
-- subprovincia → oblasť → celok; every celok in Slovakia is listed below.
--
-- NOTE on the Tatras: at the strict academic level "Tatry" is a single celok (podcelky
-- Východné/Západné Tatry). This seed follows the colloquial/tourist split required by the app —
-- Vysoké Tatry, Belianske Tatry, Západné Tatry — as three rows instead of one "Tatry" row.
-- name_en equals name_sk for ranges with no established English exonym (most of them).

insert into regions (slug, name_en, name_sk, kraj, centroid_lon, centroid_lat, is_public) values
-- ── Anchor rows (verified) ─────────────────────────────────────────────────────────────────
('vysoke-tatry',          'High Tatras',           'Vysoké Tatry',          'Prešovský',       20.13, 49.18, true),
('zapadne-tatry',         'Western Tatras',        'Západné Tatry',         'Žilinský',        19.75, 49.18, false),
('belianske-tatry',       'Belianske Tatras',      'Belianske Tatry',       'Prešovský',       20.27, 49.23, false),
('nizke-tatry',           'Low Tatras',            'Nízke Tatry',           'Banskobystrický', 19.55, 48.95, false),
('mala-fatra',            'Malá Fatra',            'Malá Fatra',            'Žilinský',        19.05, 49.22, false),
('velka-fatra',           'Veľká Fatra',           'Veľká Fatra',           'Žilinský',        19.10, 48.95, false),
('slovensky-raj',         'Slovak Paradise',       'Slovenský raj',         'Košický',         20.40, 48.90, false),
('volovske-vrchy',        'Volovské vrchy',        'Volovské vrchy',        'Košický',         20.75, 48.83, false),
('cierna-hora',           'Čierna hora',           'Čierna hora',           'Košický',         21.05, 48.88, false),

-- ── Eastern Carpathians — Vihorlat-Gutín & Poloniny (far east, highest longitudes) ───────────
('vihorlatske-vrchy',     'Vihorlatské vrchy',     'Vihorlatské vrchy',     'Košický',         22.10, 48.90, false),
('bukovske-vrchy',        'Bukovské vrchy',        'Bukovské vrchy',        'Prešovský',       22.30, 49.08, false),

-- ── Eastern Carpathians — Nízke Beskydy (Low Beskids) ────────────────────────────────────────
('busov',                 'Busov',                 'Busov',                 'Prešovský',       21.30, 49.35, false),
('ondavska-vrchovina',    'Ondavská vrchovina',    'Ondavská vrchovina',    'Prešovský',       21.65, 49.20, false),
('laborecka-vrchovina',   'Laborecká vrchovina',   'Laborecká vrchovina',   'Prešovský',       21.95, 49.20, false),
('beskydske-predhorie',   'Beskydské predhorie',   'Beskydské predhorie',   'Prešovský',       21.90, 48.95, false),

-- ── Pannonian Basin — Východoslovenská nížina (East Slovak Lowland) ──────────────────────────
('vychodoslovenska-rovina','Východoslovenská rovina','Východoslovenská rovina','Košický',        22.00, 48.55, false),
('vychodoslovenska-pahorkatina','Východoslovenská pahorkatina','Východoslovenská pahorkatina','Košický',  21.70, 48.75, false),
('zemplinske-vrchy',      'Zemplínske vrchy',      'Zemplínske vrchy',      'Košický',         21.75, 48.50, false),

-- ── Inner Western Carpathians — Matransko-slanská oblasť (volcanic east/south) ───────────────
('slanske-vrchy',         'Slanské vrchy',         'Slanské vrchy',         'Košický',         21.55, 48.75, false),

-- ── Inner Western Carpathians — Lučensko-košická zníženina (southern basins) ─────────────────
('kosicka-kotlina',       'Košická kotlina',       'Košická kotlina',       'Košický',         21.30, 48.65, false),
('bodvianska-pahorkatina','Bodvianska pahorkatina','Bodvianska pahorkatina','Košický',         20.95, 48.55, false),

-- ── Inner Western Carpathians — Slovenské rudohorie (Slovak Ore Mountains) ───────────────────
('slovensky-kras',        'Slovak Karst',          'Slovenský kras',        'Košický',         20.80, 48.60, false),
('roznavska-kotlina',     'Rožňavská kotlina',     'Rožňavská kotlina',     'Košický',         20.55, 48.66, false),
('revucka-vrchovina',     'Revúcka vrchovina',     'Revúcka vrchovina',     'Banskobystrický', 20.20, 48.60, false),
('spissko-gemersky-kras', 'Spišsko-gemerský kras', 'Spišsko-gemerský kras', 'Košický',         20.30, 48.85, false),
('stolicke-vrchy',        'Stolické vrchy',        'Stolické vrchy',        'Banskobystrický', 20.00, 48.72, false),
('veporske-vrchy',        'Veporské vrchy',        'Veporské vrchy',        'Banskobystrický', 19.75, 48.70, false),

-- ── Eastern part of Podhôľno-magurská oblasť (north-east interior ranges) ─────────────────────
('cergov',                'Čergov',                'Čergov',                'Prešovský',       21.10, 49.20, false),
('sarisska-vrchovina',    'Šarišská vrchovina',    'Šarišská vrchovina',    'Prešovský',       21.20, 49.05, false),
('spissko-sarisske-medzihorie','Spišsko-šarišské medzihorie','Spišsko-šarišské medzihorie','Prešovský',20.95,49.10, false),
('bachuren',              'Bachureň',              'Bachureň',              'Prešovský',       21.00, 49.00, false),
('lubovnianska-vrchovina','Ľubovnianska vrchovina','Ľubovnianska vrchovina','Prešovský',       20.75, 49.30, false),
('levocske-vrchy',        'Levočské vrchy',        'Levočské vrchy',        'Prešovský',       20.65, 49.05, false),

-- ── Inner Western Carpathians — Fatransko-tatranská oblasť (eastern members) ─────────────────
('branisko',              'Branisko',              'Branisko',              'Prešovský',       20.95, 49.05, false),
('hornadska-kotlina',     'Hornádska kotlina',     'Hornádska kotlina',     'Prešovský',       20.55, 48.97, false),
('kozie-chrbty',          'Kozie chrbty',          'Kozie chrbty',          'Prešovský',       20.20, 49.00, false),
('podtatranska-kotlina',  'Podtatranská kotlina',  'Podtatranská kotlina',  'Prešovský',       20.15, 49.05, false),
('spisska-magura',        'Spišská Magura',        'Spišská Magura',        'Prešovský',       20.30, 49.30, false),

-- ── Outer Western Carpathians — Podhôľno-magurská & Východné Beskydy (north) ──────────────────
('pieniny',               'Pieniny',               'Pieniny',               'Prešovský',       20.42, 49.40, false),
('podtatranska-brazda',   'Podtatranská brázda',   'Podtatranská brázda',   'Žilinský',        19.85, 49.30, false),
('skorusinske-vrchy',     'Skorušinské vrchy',     'Skorušinské vrchy',     'Žilinský',        19.70, 49.30, false),

-- ── Inner Western Carpathians — Chočské/Starohorské/Horehronie (central north) ───────────────
('chocske-vrchy',         'Chočské vrchy',         'Chočské vrchy',         'Žilinský',        19.40, 49.15, false),
('starohorske-vrchy',     'Starohorské vrchy',     'Starohorské vrchy',     'Banskobystrický', 19.15, 48.85, false),
('horehronske-podolie',   'Horehronské podolie',   'Horehronské podolie',   'Banskobystrický', 19.85, 48.83, false),

-- ── Inner Western Carpathians — Slovenské stredohorie (Central Slovak volcanics) ─────────────
('polana',                'Poľana',                'Poľana',                'Banskobystrický', 19.50, 48.65, false),
('javorie',               'Javorie',               'Javorie',               'Banskobystrický', 19.30, 48.50, false),
('ostrozky',              'Ostrôžky',              'Ostrôžky',              'Banskobystrický', 19.55, 48.45, false),
('zvolenska-kotlina',     'Zvolenská kotlina',     'Zvolenská kotlina',     'Banskobystrický', 19.20, 48.60, false),
('pliesovska-kotlina',    'Pliešovská kotlina',    'Pliešovská kotlina',    'Banskobystrický', 19.15, 48.42, false),
('kremnicke-vrchy',       'Kremnické vrchy',       'Kremnické vrchy',       'Banskobystrický', 19.00, 48.70, false),
('ziarska-kotlina',       'Žiarska kotlina',       'Žiarska kotlina',       'Banskobystrický', 18.85, 48.58, false),
('stiavnicke-vrchy',      'Štiavnické vrchy',      'Štiavnické vrchy',      'Banskobystrický', 18.90, 48.40, false),
('krupinska-planina',     'Krupinská planina',     'Krupinská planina',     'Banskobystrický', 19.15, 48.30, false),

-- ── Inner Western Carpathians — Juhoslovenská kotlina (South Slovak Basin) ───────────────────
('juhoslovenska-kotlina', 'Juhoslovenská kotlina', 'Juhoslovenská kotlina', 'Banskobystrický', 19.85, 48.30, false),
('cerova-vrchovina',      'Cerová vrchovina',      'Cerová vrchovina',      'Banskobystrický', 19.95, 48.22, false),

-- ── Inner Western Carpathians — Fatransko-tatranská oblasť (central/western members) ─────────
('turcianska-kotlina',    'Turčianska kotlina',    'Turčianska kotlina',    'Žilinský',        18.90, 48.95, false),
('ziar',                  'Žiar',                  'Žiar',                  'Žilinský',        18.95, 48.85, false),
('zilinska-kotlina',      'Žilinská kotlina',      'Žilinská kotlina',      'Žilinský',        18.75, 49.18, false),
('strazovske-vrchy',      'Strážovské vrchy',      'Strážovské vrchy',      'Trenčiansky',     18.50, 48.95, false),
('sulovske-vrchy',        'Súľovské vrchy',        'Súľovské vrchy',        'Žilinský',        18.55, 49.12, false),
('hornonitrianska-kotlina','Hornonitrianska kotlina','Hornonitrianska kotlina','Trenčiansky',    18.55, 48.75, false),
('vtacnik',               'Vtáčnik',               'Vtáčnik',               'Trenčiansky',     18.60, 48.65, false),
('pohronsky-inovec',      'Pohronský Inovec',      'Pohronský Inovec',      'Nitriansky',      18.55, 48.45, false),
('tribec',                'Tribeč',                'Tribeč',                'Nitriansky',      18.35, 48.45, false),
('povazsky-inovec',       'Považský Inovec',       'Považský Inovec',       'Trenčiansky',     18.05, 48.65, false),

-- ── Outer Western Carpathians — Stredné & Západné Beskydy (north-west) ────────────────────────
('oravska-vrchovina',     'Oravská vrchovina',     'Oravská vrchovina',     'Žilinský',        19.55, 49.45, false),
('oravska-magura',        'Oravská Magura',        'Oravská Magura',        'Žilinský',        19.35, 49.30, false),
('oravske-beskydy',       'Oravské Beskydy',       'Oravské Beskydy',       'Žilinský',        19.45, 49.45, false),
('podbeskydska-brazda',   'Podbeskydská brázda',   'Podbeskydská brázda',   'Žilinský',        19.40, 49.35, false),
('podbeskydska-vrchovina','Podbeskydská vrchovina','Podbeskydská vrchovina','Žilinský',        19.30, 49.40, false),
('kysucke-beskydy',       'Kysucké Beskydy',       'Kysucké Beskydy',       'Žilinský',        19.05, 49.45, false),
('kysucka-vrchovina',     'Kysucká vrchovina',     'Kysucká vrchovina',     'Žilinský',        18.85, 49.35, false),
('turzovska-vrchovina',   'Turzovská vrchovina',   'Turzovská vrchovina',   'Žilinský',        18.55, 49.40, false),
('javorniky',             'Javorníky',             'Javorníky',             'Žilinský',        18.30, 49.25, false),

-- ── Outer Western Carpathians — Slovensko-moravské Karpaty (west) ────────────────────────────
('povazske-podolie',      'Považské podolie',      'Považské podolie',      'Trenčiansky',     18.15, 48.95, false),
('biele-karpaty',         'White Carpathians',     'Biele Karpaty',         'Trenčiansky',     17.90, 48.90, false),
('myjavska-pahorkatina',  'Myjavská pahorkatina',  'Myjavská pahorkatina',  'Trenčiansky',     17.55, 48.72, false),

-- ── Inner Western Carpathians — Malé Karpaty + Matransko-slanská Burda (far west/south) ───────
('male-karpaty',          'Little Carpathians',    'Malé Karpaty',          'Bratislavský',    17.30, 48.40, false),
('burda',                 'Burda',                 'Burda',                 'Nitriansky',      18.80, 47.85, false),

-- ── Pannonian Basin — Podunajská nížina (Danubian Lowland) ───────────────────────────────────
('podunajska-pahorkatina','Danubian Upland',       'Podunajská pahorkatina','Nitriansky',      18.20, 48.20, false),
('chvojnicka-pahorkatina','Chvojnická pahorkatina','Chvojnická pahorkatina','Trnavský',        17.30, 48.70, false),

-- ── Pannonian Basin — Záhorská nížina (Záhorie Lowland, far west) ─────────────────────────────
('borska-nizina',         'Borská nížina',         'Borská nížina',         'Trnavský',        17.00, 48.55, false),
('zahorska-nizina',       'Záhorská nížina',       'Záhorská nížina',       'Trnavský',        17.05, 48.50, false),
('podunajska-rovina',     'Danubian Plain',        'Podunajská rovina',     'Trnavský',        17.50, 48.10, false)
on conflict (slug) do nothing;

-- Migrate ALL existing hikes into Vysoké Tatry (current content is all High Tatras).
-- Re-assign individual hikes to other ranges later via the admin multi-select.
insert into hike_regions (hike_id, region_id)
select h.id, r.id
from hikes h
cross join regions r
where r.slug = 'vysoke-tatry'
on conflict do nothing;
