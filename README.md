# Ludivion Discourse theme

Standalone theme for the Ludivion forum. Public styles use component selectors
and Ludivion tokens; Admin forms and plugin controls keep their native styling.

## Installation and updates

Install or update this repository as a full theme, not a theme component.
Select **Ludivion Dark** as the theme's color palette in Discourse Admin. When
Discourse offers separate light and dark palette selections, use Ludivion Dark
for both to keep the intended appearance consistent.

The palette is declared in `about.json`. Discourse assigns the first bundled
palette on a fresh theme import, but updating an existing installation does not
replace its saved palette assignment. An existing installation with **Light
Default** therefore needs that one-time selection. The component fixes in this
revision also support Light Default; they do not replace global Discourse color
variables or change the server's settings from JavaScript.

Before installing or updating a revision containing background video/music, go to
**Admin → Settings**, search for **theme authorized extensions**
(`theme_authorized_extensions`), and append `mp4` and `mp3` to the existing
list. Save, then retry the theme update. Discourse's default list excludes video
formats, so otherwise the import fails with `Error creating upload asset:
forum_hero_video`. This setting applies to theme uploads; changing the ordinary
post-upload `authorized_extensions` setting does not resolve this theme error.

## Music controls

The public header includes a compact music player. On wide screens it shows the
track name and previous/play/next controls. Narrow screens and the sticky topic
header use one music button opening the full controls, with 44px touch targets.
Shuffle, repeat-one/playlist, volume, playback status and the track name are
available in the panel. Controls and statuses follow the active Discourse locale;
the six original track titles remain unchanged.

The two-deck player and queue are adapted from `ludivion-web`'s launch music.
Fresh visits start at 20% with a 0.6-second fade; switching tracks crossfades for
up to 5 seconds. Autoplay may require the first click/tap. Preferences and the
selected track are saved under `ludivion_forum_music_v1`, separately from the
website; an explicit pause remains paused. A full page reload starts the saved
track from the beginning, while forum navigation retains the playback position.
The service starts during application boot without waiting for the header or
discovery content to mount. The MP3's own introduction is preserved.
The application-owned service keeps a single player across header remounts,
pauses on hidden tabs and Admin/auth routes, and resumes on public routes if
music is enabled. Route changes do not halve the user's volume.

The six MP3s are bundled in `assets/music/` and resolved through theme-upload
URLs. Web Audio controls gain rather than relying on mobile media-element volume.
Cross-origin CDN uploads must permit CORS; audio requests use anonymous CORS.
If a track fails, the queue skips it; a wholly unavailable playlist shows an
error with working retry controls. Escape closes the panel and restores focus;
outside clicks close it without stealing focus.

## Translations

Public theme text uses Discourse's native `i18n` with the theme namespace:
homepage/search/social labels, Hall cards and category headings, topic counts,
latest heading and all music controls, statuses, tooltips and accessibility labels.
Catalogs are in `locales/`: English fallback plus Spanish (`es`), Russian (`ru`),
German (`de`), French (`fr`), Italian (`it`), Japanese (`ja`), Simplified Chinese
(`zh_CN`), Portuguese (`pt` and `pt_BR`), Korean (`ko`) and Turkish (`tr_TR`).

The existing Discourse language switcher chooses the same locale for the theme.
Its normal reload also loads these translations; no separate language preference,
DOM text replacement or translation API is used. A missing translation falls back
through Discourse to English. Native categories/posts retain Discourse's own
content translations; the theme catalogs cover the custom Hall copy. Routing
identifiers, category matching, brand names and track metadata stay stable.
Numbers, percentages and topic-count plural forms use the active locale.

After updating the theme, reload and check the homepage, a top-level category
heading and the open music panel in each enabled language. Native language
settings still determine which languages are offered by the switcher.

## Homepage and counts

- The route shell in `below-site-header` contains body classes and decorative
  layers only. The homepage introduction is rendered in `above-main-container`,
  inside the same content column as the native topic list. The sidebar keeps
  Discourse's layout, sticky behavior and toggle.
- Community Hall counts include the parent and all descendants visible to the
  current user. Missing counts are hidden; actual zero counts remain zero.
  Discourse's service topics describing categories are excluded by its counters.
- The homepage hero includes X, Discord and Ludivion links below its search.
  Icons are bundled as theme assets; the links have hover and keyboard focus
  states and 44px touch targets. They follow the homepage hero visibility setting.
- Category artwork uses the category's uploaded logo in native box layouts.
  It covers approximately 90% of the card with dimming and blur. Text, links and
  small subcategory icons remain separate and sharp. Descriptions wrap without
  a four-line cutoff; cards grow with their content and retain inner spacing.
- Category page headers show their name and description without the uploaded
  logo or a surrounding frame; artwork remains visible in category cards.
- Topic and category pages share the backdrop with about 20% less dimming and
  blur than the original revision. Images inside posts are unaffected.

## Homepage background video

The homepage uses `assets/forum-hero.mp4` as its only video source. This silent
MP4 contains the full forward pass followed by the reversed frames. Turnaround
frames are not duplicated: native looping repeats the forward/reverse sequence
without a jump from the last frame to the first. It retains 3840×2160, uses
H.264 with fast-start metadata, and has no audio track.
Both directions are retimed inside the MP4 to 50% of the original speed:
the same 240 frames now span 20 seconds at 12 fps. Frame timestamps and durations
are doubled without re-encoding the image. Browser playback stays at 1×, so the
slowdown applies equally to both halves without depending on runtime rate changes.
When replacing this asset, prepare the same forward/reverse sequence inside the
single MP4, with both halves retimed to half speed; the browser does not reverse
or slow down an ordinary forward-only clip.
`forum-hero.webp` remains visible until playback starts, and on download,
decoding or autoplay failure. Category/topic pages continue using the image.
Reduced-motion preferences keep the image and prevent video loading; playback
pauses when the tab is hidden and is cleaned up when leaving the homepage.

## Verification

The tests require Node.js 22 or newer. Install the YAML validation dev dependency
once (or after changing the lockfile):

```sh
npm ci
npm test
```

After updating the installed theme, check:

1. Home at desktop and mobile widths: sidebar starts under the header, cards
   align with the topic list, and the sidebar toggle still works. Below the hero
   search, check the three social links, icons and keyboard focus. Check silent
   forward/reverse MP4 looping and image fallback while loading or on playback failure,
   reduced-motion behavior and navigation away from/back to the homepage.
2. Topic pagination and returning from a topic: no light row flash.
3. Login and signup: dark header, fully visible logo, readable fields.
4. Topics: gold title both above the post and in the sticky header, avatar inside
   the post card, padded statistics controls without a duplicate top rule,
   copper link/event separators, readable signup prompt, sticky avatar and
   native reply/edit actions.
5. Category boxes with and without artwork, including subcategories: no inner
   white frame; page headers have no logo/frame; navigation has no decorative
   border but retains keyboard focus and readable tag labels. Category and topic
   backdrops have the same visibility.
6. Admin, composer and Invite/Review/Search controls: native behavior and the
   existing component skins remain intact.
7. Welcome search: one outer frame and a working magnifier. Dropdown search:
   no inner yellow ring, with a visible focus surface and working filtering and
   keyboard selection in both Select Kit and DMenu.
8. Groups (`/g/<name>`, `/activity/posts`, `/manage/profile`): readable headers,
   member tables and activity on dark panels. Check navigation, member filtering,
   description editing in both editor modes, flair upload/preview and saving at
   desktop and mobile widths. Configured flair colors and native permissions
   remain intact; management checks require an authorized group owner or admin.
9. Music on desktop/mobile, guest/member headers and sticky topic titles:
   verify play/pause, volume, previous/next, shuffle/repeat, panel focus/closing,
   first-tap unlock and fade/crossfade. Navigate between public pages without a
   restart; Admin and hidden tabs pause. Check saved disabled/volume settings,
   missing-track handling and the unchanged native search/user menus.
10. Header language switcher: readable trigger and language names at rest,
    on hover, keyboard focus and touch press; the current language remains
    visibly selected. Verify selection still changes the locale and reloads.

Local CSS fixtures can validate colors and geometry against the deployed core
styles. They do not replace these checks in a running Discourse application.
