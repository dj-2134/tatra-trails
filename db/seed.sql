-- db/seed.sql — run after db/schema.sql. Coarse starter geometry; refine via import procedure.
insert into hikes (slug, name_en, name_sk, geometry, seasonal_from, seasonal_to, seasonal_partial, note_en, note_sk, ref) values
('strbske-lakeside-loop', 'Štrbské Pleso lakeside loop', 'Okruh okolo Štrbského plesa',
 '{"type":"LineString","coordinates":[[20.0600,49.1180],[20.0650,49.1205],[20.0620,49.1230],[20.0560,49.1210],[20.0600,49.1180]]}'::jsonb,
 null, null, false, null, null, 'https://www.tanap.sk/'),
('strbske-popradske', 'Štrbské Pleso → Popradské Pleso', 'Štrbské Pleso → Popradské Pleso',
 '{"type":"LineString","coordinates":[[20.0626,49.1192],[20.0731,49.1356],[20.0888,49.1577]]}'::jsonb,
 '11-01', '06-15', false, null, null, 'https://www.tanap.sk/'),
('hrebienok-zbojnicka', 'Hrebienok → Zbojnícka Chata', 'Hrebienok → Zbojnícka chata',
 '{"type":"LineString","coordinates":[[20.2316,49.1585],[20.2180,49.1740],[20.2069,49.1899]]}'::jsonb,
 '11-01', '06-15', true, 'Upper section seasonally closed', 'Horný úsek sezónne uzavretý', 'https://www.tanap.sk/'),
('popradske-rysy', 'Popradské Pleso → Rysy', 'Popradské Pleso → Rysy',
 '{"type":"LineString","coordinates":[[20.0888,49.1577],[20.0886,49.1690],[20.0883,49.1795]]}'::jsonb,
 null, null, false, null, null, 'https://www.tanap.sk/')
on conflict (slug) do nothing;

-- An active, ongoing full ad-hoc closure on the Rysy route (demonstrates ad-hoc + source link).
insert into closures (hike_id, from_date, to_date, partial, reason_en, reason_sk, source)
select id, '2026-06-01', null, false, 'Rockfall', 'Zosuv kameňov', 'https://www.tanap.sk/'
from hikes where slug = 'popradske-rysy';

-- ---------------------------------------------------------------------------
-- GEOMETRY IMPORT PROCEDURE (to add a new hike or refine an existing one):
--   1. Find the route on OpenStreetMap (or record a GPX of the marked trail).
--   2. Export it to a GeoJSON LineString of [lon,lat] pairs (e.g. geojson.io:
--      draw/trace the route, or import GPX, then "Save → GeoJSON"). Keep it to
--      a sensible number of points (simplify long routes).
--   3. INSERT (or UPDATE) the hikes row, pasting the GeoJSON into `geometry`:
--        insert into hikes (slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref)
--        values ('<slug>','<EN>','<SK>','<GEOJSON>'::jsonb,'<MM-DD or NULL>','<MM-DD or NULL>',<bool>,<note or NULL>,<note or NULL>,'<ref or NULL>');
--   4. Seasonal dates come from TANAP's Návštevný poriadok (tanap.sk) for that section.
-- Attribution: routes traced from OpenStreetMap data are © OpenStreetMap contributors (ODbL).
-- ---------------------------------------------------------------------------
