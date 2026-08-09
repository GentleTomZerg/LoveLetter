# Research: Legally usable card images for a fan implementation of Love Letter

## Summary

No complete fan-made/recreated Love Letter card set with an **explicit, verified open license** (CC0/CC-BY/MIT) was found — every promising complete-set candidate (Konstantin Sokolov's PnP redesign, johnnyneverwalked/loveletterio, various itch.io rethemes) either states no license at all or only "personal use." The fully verified paths are therefore (a) per-asset medieval-fantasy portrait/icon packs from OpenGameArt/Kenney/game-icons.net, and (b) public-domain tarot card scans on Wikimedia Commons, and (c) emoji libraries (Twemoji CC BY 4.0, OpenMoji CC BY-SA 4.0, Noto Emoji Apache 2.0). **Single best verified option: game-icons.net (CC BY 3.0)** — a complete, consistent, attribution-clear medieval-fantasy icon library that covers all 8 roles and is explicitly endorsed by its authors for card-game use with a rules-book credit.

---

## Findings

### Category 1 — Complete fan-made / open-license Love Letter card sets

1. **No verified-license complete set exists (verified negative result).** Exhaustive search of GitHub, itch.io, OpenGameArt, and PnP sites surfaced only complete sets whose licenses are absent, code-only, or personal-use-only. This is the honest headline: category 1 is empty after verification. [Search coverage: GitHub repos `johnnyneverwalked/loveletterio`, `gridatek/throne`, `VSAnimator/love_letter`, `swmcc/rails_love_letter`, `George-RG/Love-Letter`, `gges5110/LoveLetter`, `mon-kiss/loveletter`, `user01/love-letter`, `brucehow/loveletter`, `ghozt12/csse2310`, `eliottcoint/Love_Letter_IA41`, `gavrilovmiroslav/love-letter`; itch.io rethemes; PnP Paradise; BoardGameGeek]

2. **Blocker — johnnyneverwalked/loveletterio: all 8 card faces + back, but NO license.** Repo contains `public/images/1.jpg`–`8.jpg` + `card-back.jpg` (complete 16-card role set, original art; README explicitly says "I did not use the original card art for obvious copyright reasons"). However, the repository has **no LICENSE file**, so reuse is not legally granted. Do not use without contacting the author. [Source](https://github.com/johnnyneverwalked/loveletterio)

3. **Blocker — PnP Paradise "Love Letter (Redesign)" by Konstantin Sokolov (kotdesign): complete 16-card set, no stated license.** The page says it is "a custom print and play Love Letter … redesigned … with different art," and the BGG filepage ("Love Letter Rework") claims it is "a total graphic redesign free of publisher copyrights" — i.e., original art, but **no explicit reuse license is stated anywhere** (BGG file downloads carry no default CC/MIT grant). Direct fetch of the BGG filepage returned HTTP 403, so terms could not be verified. Usable only if the author grants a license. [PnP Paradise](https://www.pnpparadise.com/set1/love-letter), [BGG files listing](https://boardgamegeek.com/files/thing/129622)

4. **Code-only GitHub repos (MIT) contain no card art assets — verified by repo-tree inspection.** `gridatek/throne` (MIT; Angular/Supabase, card UI is Tailwind/CSS, no image assets), `VSAnimator/love_letter` (no LICENSE file visible in tree despite README claim, no image assets), `swmcc/rails_love_letter` (MIT, Tailwind UI, no assets), `George-RG/Love-Letter` (MIT, `images/` dir exists but its contents/licensing unverified — inspect before use). An MIT LICENSE on a repo does **not** retroactively license art, but when no art exists there is nothing to license — usable for engine/logic only. [throne](https://github.com/gridatek/throne), [VSAnimator/love_letter](https://github.com/VSAnimator/love_letter), [George-RG/Love-Letter](https://github.com/George-RG/Love-Letter)

5. **Out of scope (official/derivative):** Z-Man's official free "Love Letter: Sender" PnP and Asmodee's print-and-play page are publisher content, not licensed for reuse; itch.io rethemes (Sonic skin, Twin Peaks, Star Wars) are copyrighted-character skins with "personal use" terms or no license. [Z-Man Sender](https://zmangames.com/en/products/love-letter-sender/), [Asmodee PnP](https://print-and-play.asmodee.fun/en/game/love-letter), [Star Wars skin](https://mattj375.itch.io/love-letter-star-wars-editition)

### Category 2 — Generic medieval-fantasy character/portrait assets (verified)

6. **OpenGameArt — "Fantasy Action Icons And Card Design": CC0 (verified on page).** 70 PNGs (~500–1000 px), black-with-white-accent action-pose silhouettes plus a "simple bloody card design" — a ready-made card frame + icon set. License field: `CC0` (link to creativecommons.org/publicdomain/zero/1.0/). No attribution required. [Source](https://opengameart.org/content/fantasy-action-icons-and-card-design)

7. **OpenGameArt — "2D RPG Character Portraits": CC0 (verified).** PNG portrait faces, suitable as card-face art. License field: `CC0`. [Source](https://opengameart.org/content/2d-rpg-character-portraits)

8. **OpenGameArt — "RPG Characters Avatars": CC0 (verified).** High-quality avatar icon set (used by the AnyRPG project; community comment calls it "the first high quality set of cc0 avatar icons"). License field: `CC0`. [Source](https://opengameart.org/content/rpg-characters-avatars)

9. **OpenGameArt — "Tiny RPG CC0 Characters and Portraits" (tiopalada): CC0 (verified).** Characters + face portraits built from Tiny RPG Character/Face Workshop I; direct zip download (`tinyrpgfacencharsdemocc0.zip`, ~50 KB). License field: `CC0`. [Source](https://opengameart.org/content/tiny-rpg-cc0-characters-and-portraits)

10. **OpenGameArt — "CC0 Portraits" collection** curates all of the above plus more (32x32 Fantasy portrait set, Fever Dream Faces, etc.). Collection membership is not itself a license — verify each item's License(s) field, as done above for the four packs listed. [Source](https://opengameart.org/content/cc0-portraits)

11. **itch.io — "Fantasy Portrait Set 1" by GearHead: CC BY 4.0 (verified, exact text on page: "Released under the CC-BY 4.0 license").** 26 painted portraits (acrylic/watercolor/gouache) of humans, orcs, elves, dwarves; 600×900 PNG. Attribution required. Pack is portrait-only — confirm the 26 portraits include a guard/soldier, priest, nobleman, maid/servant, prince, king, countess, princess by inspecting the download before committing. [Source](https://gearhead.itch.io/fantasy-portait-set-1)

12. **Kenney.nl — all assets CC0, attribution optional (verified on official Support page: "all game assets on the asset pages are public domain licensed (CC0)… Attribution is not required").** Strength is card backs, frames, UI, and icons (Medieval RTS, Castle Kit, Retro Medieval Kit, platformer/sprite character packs) — Kenney does **not** publish portrait-style fantasy face art, so pair with a portrait source. [Source](https://kenney.nl/support)

13. **Weak/informal itch.io licenses (flagged, not recommended as primary):** oicaroh "Fantasy Character Portrait" pack says "Free for personal & commercial use (please just credit!)" — an informal statement, not a standard CC/MIT text, and only 5 portraits; PIXEL_1992, Studio NIK, Nyteon packs state no machine-readable license. Treat as unverified. [oicaroh](https://oicaroh.itch.io/medieval-fantasy-character-portraits)

### Category 3 — Wikimedia Commons / public domain

14. **Verified PD option: 15th-century tarot card scans.** `File:Visconti-sforza-06-love.jpg` verified **Public Domain (PD-old-100 + CC Public Domain Mark 1.0), no attribution required** (license template: `attr_required=false`). The Visconti-Sforza deck (74 surviving cards: King, Queen, Knight, Page court cards + major arcana) and Sola Busca deck (1491) are actual medieval playing-card images thematically on-point for roles like King/Prince/Knight. [Lovers card file](https://commons.wikimedia.org/wiki/File:Visconti-sforza-06-love.jpg), [Sola Busca](https://commons.wikimedia.org/wiki/File:Sola_Busca_tarot_card_17.jpg)

15. **Warning: photos of the official Love Letter cards are derivative works.** Even a CC-licensed photograph of the proprietary card artwork reproduces the copyrighted artwork — not usable. No such files surfaced in Commons search, but do not go looking for them as a workaround. [Commons licensing context](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)

### Category 4 — Emoji / symbol-based (verified)

16. **game-icons.net — CC BY 3.0 (verified on About page: "provided under the terms of the Creative Commons 3.0 BY license"; some icons CC0 per author).** 4,180+ medieval-fantasy SVG/PNG icons (searchable; a dedicated "Board & Card" tag with 116 icons exists). Exact attribution format given: *"Icons made by {author}; Available on https://game-icons.net"* — per-icon author must be credited. FAQ explicitly sanctions card games ("if you make a board / card game, add a mention in the last pages of your rules book"). [About](https://game-icons.net/about.html), [FAQ](https://game-icons.net/faq.html), [Board tag](https://game-icons.net/tags/board.html)

17. **Twemoji — graphics CC BY 4.0 (verified LICENSE-GRAPHICS), code MIT.** Full emoji set in SVG + PNG; covers role symbols (e.g., shield 🛡, crown 👑, knight 🫅, heart 💌). Attribution: "Graphics by Twitter/Twemoji, licensed CC BY 4.0." [LICENSE-GRAPHICS](https://github.com/twitter/twemoji/blob/master/LICENSE-GRAPHICS)

18. **OpenMoji — CC BY-SA 4.0 (verified LICENSE.txt + FAQ).** SVG + PNG (72px/618px). Share-alike caveat: any derived card artwork must be released under CC BY-SA 4.0. [Repo](https://github.com/hfg-gmuend/openmoji), [FAQ](https://openmoji.org/faq/)

19. **Noto Emoji — Apache 2.0 for the SVG/PNG assets (verified `svg/LICENSE`), font OFL.** No attribution required (Apache notice retention). [svg/LICENSE](https://github.com/googlefonts/noto-emoji/blob/main/svg/LICENSE)

20. **SpicyGame "Cards!" — CC0 pixel playing-card deck (verified on page).** Good for frames/backs, not role faces. [Source](https://spicygame.itch.io/cards)

---

## Prioritized candidate list (verified status)

| # | Name | URL | License (exact) | Contents | Format | Attribution |
|---|------|-----|------------------|----------|--------|-------------|
| 1 | game-icons.net | https://game-icons.net | CC BY 3.0 (some icons CC0) | 4,180+ fantasy icons; all 8 roles coverable via symbols (helmet/hood/crown/heart/knight/shield…) | SVG + PNG | Required: "Icons made by {author}… game-icons.net" per icon |
| 2 | OGA — Fantasy Action Icons And Card Design | https://opengameart.org/content/fantasy-action-icons-and-card-design | CC0 1.0 | 70 action-silhouette PNGs + card design/frame | PNG | None |
| 3 | OGA — 2D RPG Character Portraits | https://opengameart.org/content/2d-rpg-character-portraits | CC0 1.0 | portrait faces (verify count/roles) | PNG | None |
| 4 | OGA — RPG Characters Avatars | https://opengameart.org/content/rpg-characters-avatars | CC0 1.0 | avatar icon set | PNG | None |
| 5 | OGA — Tiny RPG CC0 Characters and Portraits | https://opengameart.org/content/tiny-rpg-cc0-characters-and-portraits | CC0 1.0 | characters + portraits (zip) | PNG (zip) | None |
| 6 | Kenney.nl (all packs) | https://kenney.nl/assets | CC0 1.0 | backs/UI/icons/sprites; no portrait faces | PNG/SVG/3D | Optional |
| 7 | GearHead — Fantasy Portrait Set 1 | https://gearhead.itch.io/fantasy-portait-set-1 | CC BY 4.0 | 26 painted portraits (humans/orcs/elves/dwarves) | PNG 600×900 | Required (CC BY 4.0) |
| 8 | Wikimedia Commons — Visconti-Sforza / Sola Busca tarot scans | https://commons.wikimedia.org/wiki/Category:Pierpont_Morgan-Bergamo_Visconti-Sforza_Tarot | PD-old-100 / CC PDM 1.0 | actual medieval card images (King, Queen, Knight, Lovers…) | JPG | None |
| 9 | Twemoji | https://github.com/twitter/twemoji | CC BY 4.0 (graphics), MIT (code) | full emoji set | SVG + PNG | Required (CC BY 4.0) |
| 10 | OpenMoji | https://github.com/hfg-gmuend/openmoji | CC BY-SA 4.0 | full emoji set | SVG + PNG | Required + share-alike |
| 11 | Noto Emoji | https://github.com/googlefonts/noto-emoji | Apache 2.0 (svg/), OFL (font) | full emoji set | SVG + PNG | None |
| 12 | SpicyGame Cards! | https://spicygame.itch.io/cards | CC0 | pixel deck (frames/backs only) | PNG | None |
| 13 | **Sokolov redesign (PnP Paradise / BGG)** | https://www.pnpparadise.com/set1/love-letter | **NONE STATED** | complete 16-card set, original art | PDF/JPG | n/a — contact author |
| 14 | **johnnyneverwalked/loveletterio** | https://github.com/johnnyneverwalked/loveletterio | **NO LICENSE FILE** | all 8 faces + back | JPG | n/a — contact author |
| 15 | gridatek/throne, VSAnimator/love_letter, etc. | (see Findings #4) | MIT (code only) | no art assets | — | n/a |

---

## Recommendation

**Single best option: game-icons.net — CC BY 3.0.** It is the only candidate that is fully verified, covers every one of the 8 roles with a consistent art style (searchable medieval-fantasy icon library), ships in both SVG and PNG, has an exact prescribed attribution string, and is explicitly endorsed by the authors for card games with a credit in the rulebook. It is the same building block used by existing open projects that implement Love Letter roles (e.g., the "Deck of Many Dice" on itch.io, which combines Kenney CC0 + game-icons CC BY 3.0 art) — a working precedent that this exact route is legal and practical.

**Alternate 1 (portrait look, zero attribution): OGA CC0 stack** — "Fantasy Action Icons And Card Design" (card frame) + "2D RPG Character Portraits" / "RPG Characters Avatars" / "Tiny RPG CC0 Characters and Portraits" as faces; optionally Kenney CC0 card backs. All verified CC0, no attribution, closer to a real card game's look than icons; cost: cherry-picking and role mapping.

**Alternate 2 (painterly faces): GearHead "Fantasy Portrait Set 1" (CC BY 4.0)** — 26 painted portraits; must inspect the pack to confirm all 8 roles are covered (or accept near-matches), and add a CC BY 4.0 credit. If a PD, medieval-authentic look is preferred instead, use the Visconti-Sforza/Sola Busca Commons scans (PD, no attribution).

**If a complete 16-card set is mandatory:** the only viable path is permission-based — contact Konstantin Sokolov (kotdesign, via BGG) for the redesign or the loveletterio author; neither grants reuse by default today.

---

## Sources

**Kept:**
- Game-icons.net About + FAQ — primary license text (CC BY 3.0, attribution format, card-game endorsement). https://game-icons.net/about.html , https://game-icons.net/faq.html
- Kenney Support — official CC0 + attribution-optional statement. https://kenney.nl/support
- OpenGameArt item pages (raw HTML license fields verified): fantasy-action-icons-and-card-design, 2d-rpg-character-portraits, rpg-characters-avatars, tiny-rpg-cc0-characters-and-portraits — all show `License(s): CC0`.
- GearHead Fantasy Portrait Set 1 (itch.io) — explicit "CC-BY 4.0" on page.
- Wikimedia Commons File:Visconti-sforza-06-love.jpg — PD-old-100 / PDM, attr not required (file info template).
- twitter/twemoji LICENSE-GRAPHICS — CC BY 4.0; hfg-gmuend/openmoji LICENSE.txt — CC BY-SA 4.0; googlefonts/noto-emoji svg/LICENSE — Apache 2.0.
- SpicyGame Cards! (itch.io) — CC0 statement.
- github.com/johnnyneverwalked/loveletterio (repo tree: images present, no LICENSE); gridatek/throne + VSAnimator/love_letter (repo trees: no art assets).
- PnP Paradise Love Letter page — redesign exists, no license stated.
- BoardGameGeek files/thing/129622 — Sokolov "Love Letter Rework" existence + "free of publisher copyrights" claim.
- SnepShark "The Deck of Many Dice" (itch.io) — precedent of Kenney CC0 + game-icons CC BY 3.0 for Love Letter roles.

**Dropped:**
- Behance "Love Letter Special Edition", Kardma redesign, Coroflot "AEG 4 Versions" — portfolio showcases, no license.
- itch.io Sonic/Twin Peaks/Star Wars Love Letter skins — third-party-IP characters, personal-use/no license.
- "WISH UPON A STAR" (Sonic skin), "Love Letter: Legacy", "Love Letter: My True Feelings" — no reusable license.
- warengonzaga/love-cards — unrelated "love cards web app", not a game asset set.
- freesvg.org / Flaticon / shadcn icon pages — generic love-letter icons, not card sets, license unclear or beyond scope.
- oicaroh / PIXEL_1992 / Studio NIK / Nyteon / Kalponic / Foozle / LuizMelo / Wouter van Vugt itch packs — no standard license text verified (informal or absent), flagged rather than recommended.
- Asmodee PnP / Z-Man "Love Letter: Sender" / BGG Premium PnP — official publisher content, not reusable.
- OpenGameArt "Playing Cards", "Cards Set", "Playing Cards Pack", Bridge-Sized Playing Card Deck, VerzatileDev Card Deck, KereneL pixel cards — standard 52-card decks, wrong content (no fantasy roles).
- OpenGameArt WTactics card art (e.g., "Border Patrol", "Merfolk Diviner") — GPL 3.0-licensed art; avoid unless the fan game itself is GPL.

---

## Gaps

- **No verified complete open-licensed Love Letter set** exists in any searched catalog; if the parent requires a drop-in 16-card set, the next step is contacting Konstantin Sokolov (kotdesign, BoardGameGeek) or the loveletterio author for an explicit license, or commissioning original CC0 art.
- **GearHead pack contents not downloaded/inspected** — need to confirm portraits exist for all 8 roles (guard, priest, baron, handmaid, prince, king, countess, princess) before committing.
- **game-icons per-icon attribution list** must be generated per chosen icon (each icon page lists its author); icon slugs for specific roles were not individually verified in this session (library search at game-icons.net is the authoritative selector).
- **BGG filepage for the Sokolov redesign returned HTTP 403** — its exact download terms could not be read; only the files-list snippet was available.
- **Trademark note (out of research scope, flagged):** this brief covers *image* licensing only. Game mechanics are not copyrightable, but the "Love Letter" title and the Tempest-world names (Princess Annette, etc.) may be trademarked/protected — consider generic role names and a disclaimer in the fan implementation.