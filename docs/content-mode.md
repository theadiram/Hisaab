# Hisaab Content Mode

Open the clapperboard button in the map header. All three filming tools share the current map and source cards; they do not create fictional evidence.

## Director

22 camera presets: India reveal, India rise, north-to-south, south-to-north, east-to-west, Himalayas, Ganges, west coast, east coast, northeast, Deccan, islands, push-in, pull-out, lateral pan, top-down, selected-location approach, orbit, arc, rise, receipt reveal and hold. Location presets become available after selecting a dot.

Choose movement duration, slow/normal/fast speed, satellite/map look, day/Obsidian theme and screen/16:9/9:16/1:1 framing. Receipt controls show, hide or emphasise the card. Clean frame hides navigation clutter while preserving map attribution and source/evidence labels. The optional archive counter identifies historical locations, not verified payments.

### Card-shot presets

Director also has nine reusable card shots: Full receipt, Location portrait, Money close-up, Funding timeline, Payment detail, Responsible roles, Evidence check, Source proof and Report action. They enlarge the selected receipt and smoothly scroll its own content to the relevant section; the map stays in place. Source proof expands the existing source details. Report action frames the buttons without submitting a complaint. Reset card framing restores the normal receipt.

When a section is missing, its preset shows the evidence summary and an explicit notice. Financial values remain unknown. Focused shots retain the record title and financial-link status. The selected section is saved in Shot Builder and restored during replay. Older shot files without a selected section still import as Full receipt.

## Guided Showcase

Five sequences: Country → scale → receipt, Historical location scale, Selected location story, Landscape journey, Coasts and islands. They enable historical locations, move through the landscape and include the selected receipt where applicable. With no selected asset, selection-dependent segments are skipped with an explicit notice. No random asset or financial facts are invented.

## Shot Builder

Save up to 60 shots. Each remembers the camera, record selection, financial-year filters, layers, map look, theme, frame and card presentation. Rename, reorder, delete, edit movement/hold durations, preview one shot or replay the timeline. Browser storage saves the timeline locally. Export JSON for backup or transfer; import validates the entire file before replacing the current timeline. JSON contains shot instructions, not private evidence or payment data.

## Recording and controls

Use a screen recorder to capture footage. This feature does not export an MP4. Fullscreen is optional and browser-dependent.

- Space: play/pause or resume the remaining movement.
- H: hide/show Content Mode controls.
- K: save the current camera.
- Escape: stop playback and restore controls.
- Tap the map to restore hidden controls; dragging or scrolling interrupts playback.

Replay restores the sequence's source selection and starting context. Reduced-motion preferences replace camera movement with immediate positioning. Portrait framing adapts the card to a bottom sheet. Switching frame sizes resizes the existing map rather than creating extra map instances.

Wait for imagery is enabled by default, with a bounded loading check and a useful failure message. It can be disabled when recording already-loaded areas. Tile delivery, GPU performance and screen-recording quality remain dependent on the device and network. Source coordinates get the existing location highlight; no building footprint is invented from a point.

## Implementation

`src/lib/content-mode.ts` owns presets and validated shot schemas; `src/lib/content-player.ts` owns cancellable playback; `src/components/content-studio.tsx` owns the controls. The existing map handles framing, camera movement, source previews and clipping. No publication, authentication or financial approval gates are changed.

# Remote filming control

The filming tab can pair with a separate `/studio` controller page on the same running Hisaab server. Start a remote session from Content Mode → Director → Pair remote controller; enter the one-use code in `/studio`, then close Content Mode in the filming tab. The hidden target remains paired and accepts camera presets, playback, card framing, theme, and basemap commands. The controller can reopen the fictional complete-card example.

Pair codes are one-use, expire with inactivity, and pair sessions are held in the running server process for up to 45 minutes. Commands are limited to the typed Hisaab camera/card controls. Both browser tabs must reach the same server instance; this is for same-machine local filming, not a hosted multi-instance remote-control service. Ending the session from either side invalidates the pair.

## Isolated local film capture

For production capture on this machine, `?film=capture&explore=1` enables a local filming toolbar. It leaves ordinary exploration unchanged. Keys 1/2 frame India with historical points off/on; 3–6 select four fixed archived school/road/hospital/railway records; 7 opens the existing isolated Lalbagh showcase; 8/9 frame payments/recipient; 0 frames a regional map; H hides the toolbar, C restores normal app controls, R records a seven-second live map take. The regular data/evidence labels remain on actual cards.

Map recording uses MediaRecorder on a composed canvas: actual Mapbox rendering, its current screen-space India silhouette, the app's rural background and attribution. It does not record HTML cards or controls; capture those as real browser plates and combine them in editing. Downloads are local WebM files; editorial delivery normalizes them to a constant frame rate. This avoids the failing native OBS ScreenCaptureKit source without disabling browser security or changing evidence/publication gates. The fixed asset IDs are filming selections, not new financial links. Showcase monetary/profile fields remain illustrative and excluded from spending.
