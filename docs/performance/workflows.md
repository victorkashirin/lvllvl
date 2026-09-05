# Common workflow measurements after R1–R3

Measured 2026-09-05 against fresh production builds:
**before `81c48ca` → after `e45ef45`**. Both include the fractional-zoom correctness
fix; this comparison isolates R1–R3, not that earlier fix or module migration.

## Results

Median **main-thread task milliseconds per complete gesture**, including release
and deferred work. Lower is better. These are not input-to-paint measurements.

| Workflow | 40×25 cells, before → after | 160×100 cells, before → after | 320×200 cells, before → after |
| --- | ---: | ---: | ---: |
| Single pencil click | 6.2 → 6.7 | 6.9 → 6.8 | 6.6 → 6.7 |
| Pencil drag | 47.3 → 49.9 | 53.3 → 47.7 | **73.3 → 46.0** |
| Pencil drag with onion skin | 62.3 → 50.6 | 165.0 → 47.5 | **508.9 → 44.4** |
| Small rectangle drag + commit | **174.8 → 46.1** | **428.9 → 41.8** | **1445.6 → 38.9** |
| Choose a tile | 14.5 → 14.8 | 18.7 → 18.9 | 14.2 → 13.0 |
| Pan by dragging | 36.7 → 35.4 | 30.2 → 28.7 | **26.4 → 32.8** |

**Takeaway:** on the largest document, pencil drags use **37% less** main-thread
time (1.6× faster), onion-skin drags **91% less** (11.5×), and rectangle drags
**97% less** (37×). Rectangle work now stays nearly flat as offscreen dimensions
grow. Small-document ordinary drawing and tile selection show no convincing gain.
Large-document panning was **24% slower** in the pooled medians, with the same
direction in all three rounds; it warrants follow-up rather than dismissal as noise.

For the largest document:

| Diagnostic | Before → after |
| --- | ---: |
| Pencil drag task p95 | 84.2 → 51.8 ms |
| Onion drag task p95 | 601.2 → 51.6 ms |
| Rectangle drag task p95 | 1958.8 → 55.2 ms |
| Onion move-handler p95 | 31.7 → 1.8 ms |
| Rectangle move-handler p95 | 55.1 → 0.8 ms |
| Onion RAF-gap p95 | 116.7 → 17.5 ms |
| Rectangle RAF-gap p95 | 216.7 → 17.4 ms |
| Long tasks ≥50 ms across 15 onion gestures | 60 → 0 |
| Long tasks ≥50 ms across 15 rectangle gestures | 135 → 0 |

### Work eliminated, not just deferred

Separately counted complete gestures gave identical counts in all three rounds:

- Pencil drag: **20 → 2 thumbnail updates**, unchanged artwork read/write counts.
- Onion drag: **18 → 0 previous-frame draws**; total Canvas read pixels
  **73,734,272 → 210,560**, including thumbnail repairs and fractional compositing.
- Rectangle: **35 → 8 shape draws**, **36 → 1 thumbnail updates**, and total
  Canvas read pixels **289,957,360 → 29,696**. Afterward, rectangle read pixels
  are exactly 29,696 at all three document sizes.
- Tile selection: identical counted Canvas operations.
- Pan: identical read/write pixels and grid commands, but **2 → 0 thumbnail
  updates**. Operation counts alone do not explain the worse pan timing.

## Method and limitations

- Apple M3, 24 GiB RAM, Darwin 23.6.0; headless Chromium 151.0.7922.34,
  Playwright 1.62.1; no throttling, viewport 1280×800, DPR 1.
- One bitmap layer, repeating 8×8 C64 PETSCII glyph, default palette, 350% zoom,
  centered 858×656 artwork viewport. Onion skin adds a duplicate frame.
- Three rounds, before/after order AB / BA / AB, reversing workflow/size order
  in round two. Two warmups and five timed gestures per case/round:
  **540 measured gestures total**, plus separate operation-count runs.
- Fresh isolated context/project per case; external requests intercepted, no
  user projects touched. Twelve rendering source-map entries verified
  byte-for-byte. Raw output records commits, source/bundle/harness hashes and host.
- Synthetic DOM mouse events use hit-testing and the real handlers/capture
  overlay, not hardware input. Drags contain 32 moves, four per RAF across eight
  groups. Pencil retraces two short rows; rectangle alternates small endpoints;
  tile selection clicks the side palette. Alternating colors ensure actual edits.
- Chromium `Performance.TaskDuration` deltas include handlers, deferred work,
  layout, GC within tasks, normal UI ticks and small automation overhead—not
  idle waits. Each window includes release, two RAFs, then 160 ms and two more
  RAFs. No rendering methods are disabled or manually flushed during timing.
- Dispatch timings have no renderer/Canvas wrappers. Counts use separate runs.
  Pixel counts are logical API areas, not physical GPU-transfer bandwidth.
- This was not a dedicated idle host: one-minute load averages were 4.46 at
  start and 6.33 at finish; control timings varied. Small differences and p95
  from 15 gestures are diagnostic, not budgets. No FPS, GPU completion, true
  input-to-paint, Firefox/Safari performance or mobile claims are made.

## Correctness qualifications

All runs had zero page/local-request errors. Committed stroke/perimeter cells,
release, brush/pan state and absence of pending shape/thumbnail work were checked.
All 54 before/after pairs matched final document, brush and camera state; their
independent full-render thumbnail controls also matched.

**Discrepancy in the measured build (fixed in follow-up):** the after-build 40×25 onion thumbnail differed
from its full-render control by **13 pixels, maximum channel delta 5/255**, in
all three rounds. Differences were at thumbnail row 25, columns 33–48. The other
51 after-build checks matched exactly. Before-build onion thumbnails differed
at all sizes, by at most 1/255. These are reported findings, not silently accepted
tolerances. The measurement pass did not modify application code.

**Follow-up fix:** independently scaling a crop's destination rectangle introduced
rounding that shifted its downsampling filter. Thumbnail blits now apply the
full-image scale as a context transform and retain integer crop coordinates.
The focused regression failed in both Chromium and Firefox before the fix and
now matches the full render exactly for opaque and transparent backgrounds.
Cropped raster dimensions remain unchanged (at most 120×72 in this regression).
The archived timings above describe the original measured commits, not this fix.

Validation after measurement: `npm run check` and 41 focused source tests passed.
The Chromium/Firefox browser subset initially passed 13/14: Firefox's bitmap
shape operation-count test observed 4,096,000 unexpected pixels while all its
visual checks passed. It passed three isolated reruns. An unrelated scheduled
cold-thumbnail draw entering that test's broad artwork counter is a possibility,
not a confirmed diagnosis. That intermittent test failure was not changed by
this thumbnail sampling fix.

## Reproduce

The opt-in harness reads already-built checkouts and starts temporary loopback
servers. It does not switch branches or build either input tree.

```sh
scratch=$(mktemp -d /tmp/lvllvl-workflows.XXXXXX)
git worktree add --detach "$scratch/before" 81c48ca
ln -s "$PWD/node_modules" "$scratch/before/node_modules"
(cd "$scratch/before" && npm run build)
npm run build
npm run benchmark:rendering -- --before "$scratch/before" --out "$scratch/results.json"
# Remove only the disposable worktree created above.
git worktree remove --force "$scratch/before"
```

For a quick smoke run, add `--rounds 1 --samples 1 --warmups 1 --sizes 40x25`.
Other options: `--after`, `--zoom`, and comma-separated `--workflows`.
A completed result has `finishedAt` and `equivalence`; interrupted runs retain
partial output. Thumbnail differences are recorded with pixel examples rather
than aborting timing collection. This is not a CI timing gate.

[Raw measurements (gzip JSON)](results/2026-09-05-r1-r3-workflows.json.gz):

```sh
gzip -dc docs/performance/results/2026-09-05-r1-r3-workflows.json.gz > /tmp/workflows.json
```
