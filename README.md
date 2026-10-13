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

The homepage uses the silent `forum-hero-loop.webm` asset, with an H.264 MP4
alternative for browsers that cannot play WebM. Both contain a forward pass
followed by the reversed frames; native looping repeats this complete sequence.
The original `assets/forum-hero.webm` remains the source, not the served asset.
`forum-hero.webp` remains visible until playback starts, and on download,
decoding or autoplay failure. Category/topic pages continue using the image.
Reduced-motion preferences keep the image and prevent video loading; playback
pauses when the tab is hidden and is cleaned up when leaving the homepage.

After replacing the source, regenerate both served assets with Node.js and
FFmpeg (including the `libvpx-vp9` and `libx264` encoders):

```sh
node scripts/build-hero-video.mjs
```

An FFmpeg executable outside PATH can be selected with `FFMPEG_BIN`.

## Verification

The category counting tests require Node.js 22 or newer:

```sh
node --test tests/category-topic-count.test.mjs
```

After updating the installed theme, check:

1. Home at desktop and mobile widths: sidebar starts under the header, cards
   align with the topic list, and the sidebar toggle still works. Below the hero
   search, check the three social links, icons and keyboard focus. Check silent
   forward/reverse video playback, image fallback while loading, MP4 recovery,
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

Local CSS fixtures can validate colors and geometry against the deployed core
styles. They do not replace these checks in a running Discourse application.
