# ALQAMI in the Al-Kafeel Museum

How to run ALQAMI in the museum's halls, what was checked, and what still needs doing before it goes in front of
visitors.

## Set-up in the halls

| Where | Open | What it does |
| --- | --- | --- |
| Beside each case | its QR label (`labels.html`, print on A4) | the object's page on the visitor's own phone, in visitor mode |
| A tablet on a stand | `kafeel-scan.html?museum=kiosk` or `museum-lens.html?museum=kiosk` | the camera scanner for everyone; after 2 minutes untouched it starts over for the next visitor |
| Back to normal | any page with `?museum=off` | the owner's app again |

Visitor and kiosk mode (`src/utils/museumMode.ts`) hide every "delete" control: deletions are saved per device, so
on a shared tablet one tap would hide an object from every later visitor. A kiosk also clears favourites and the
chosen language and never opens new tabs. The main app (`index.html`) sits behind the owner's sign-in, so kiosks use
the scanner pages, not the main app.

## The object records

`src/data/alkafeelArtifacts.ts` is made by `scripts/alkafeel-records.mjs` from the museum's own item pages
(museum.alkafeel.net/subjects/<id>), saved slowly (the server answers 429 to fast requests):

- the description and every value are the museum's Arabic text, word for word (176 of 183 descriptions had been cut
  off at about 60 characters by the first import);
- every labelled field is kept, in the museum's order (`facts`), with English labels from
  `scripts/alkafeel-terms.mjs`;
- English is labels and names only. The earlier English text (one boilerplate paragraph for all 183 objects, a
  "Heritage Master Artisan" maker, materials such as iron / ivory / gold shown as "Gold") was made up and is gone.
  Where there is no English description the page shows the Arabic one and says so;
- "how it came to the museum" (gift, votive offering) was shown as the maker; it is now its own field;
- every object page credits the museum and links to its record.

## The 3D models

All 183 models are AI reconstructions from a single photo (TripoSR and later passes): the front follows the photo,
the sides and back are invented. The object page now says so over the model. For a museum, the honest options are:
keep the notice, or replace them with real scans (photogrammetry or a phone's object capture, with the museum's
permission) object by object; `modelKind` in the record tells the pages which kind each model is.

## Recognition by sight: measured

`scripts/alkafeel-sight-bench.mjs` makes views like a visitor's phone at a glass case (turned and sheared, partly
out of frame, glare and a reflection on the glass, dim warm light, blur, phone JPEG) of all 183 objects, and also
asks about 30 objects taken out of the index (the museum holds far more than the 183 online, so most of what a
visitor points at is unknown to ALQAMI). The earlier bench had no test photos and reported "0 wrong" on 0 views.

Results (2026-11-26, DINOv2-small int8, 732 known views, 120 unknown views):

- ranking alone: right object first 88.8%, in the first three 95.2%;
- 3 steady frames, floor 0.72, gap 0.06 (now the museum objects' floor): 57% of objects named, none wrongly;
  1 of the 30 unknown objects named (a coconut kashkul whose near-twin is in the index: no floor up to 0.84 stops it,
  and when both twins are in the index the gap rule keeps them apart);
- one frame (a tap, an uploaded photo): only 0.82 / 0.06 named nothing wrongly.

Changes from these numbers: museum entries use a 0.72 floor (the build script and the committed indexes); the
museum lens and the Al-Kafeel scanner now need 3 steady frames and a 0.06 gap (they locked from one frame at 0.60 or
0.72 with a 0.025 gap, which on these views names wrong objects); "Catch" and photo upload name an object only under
the one-shot rule and otherwise offer the closest ones; confidence is shown as measured (it had been raised to at
least 89-92%, and the scanner started at 97% before seeing anything).

These are made-up views of the museum's own photos, not real visits: the gate before visitors use it is a walk
through the halls with a phone, writing down right / wrong / nothing for each case.

## Before visitors

1. **The museum's permission.** The text and photos are the museum's, marked "all rights reserved", and are now on
   a public site. Ask the museum (museum@alkafeel.net) before showing ALQAMI to visitors as anything official.
2. **A walk through the halls** with the scanner and a notebook (the recognition numbers above are simulated).
3. **QR labels at the cases** first: a code is always right; sight is the extra.
4. **Site size.** The built site is about 784 MB; GitHub Pages refuses sites over 1 GB. The two model sets
   (`models/alkafeel` 245 MB, `models/alkafeel-pro` 292 MB) are most of it: keep one, or move models to other storage.
5. **English and other languages.** Karbala's visitors read Arabic, Persian, Urdu and English: descriptions need
   translations that a person has checked.
6. **The part labels** in the scanner (`src/kafeelScan/partAnatomy.ts`) are written from templates per kind of
   object ("rim worked by hand", "inscription band"), not from the museum's records; review or remove them.
