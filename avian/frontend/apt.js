(function () {
  // Set window.AV_API_BASE in config.js when this frontend is hosted on a
  // different origin, for example https://avianvisitors-ebird.fly.dev.
  var API_BASE = (window.AV_API_BASE || '').replace(/\/+$/, '');
  function apiUrl(path) { return API_BASE + path; }

  var PLACEHOLDER = [{ "sci": "Calypte anna", "com": "Anna's Hummingbird", "featured": true }, { "sci": "Passer domesticus", "com": "House Sparrow" }, { "sci": "Haemorhous mexicanus", "com": "House Finch" }, { "sci": "Turdus migratorius", "com": "American Robin" }, { "sci": "Zenaida macroura", "com": "Mourning Dove" }, { "sci": "Spinus psaltria", "com": "Lesser Goldfinch" }, { "sci": "Zonotrichia leucophrys", "com": "White-crowned Sparrow" }, { "sci": "Aphelocoma californica", "com": "California Scrub-Jay" }, { "sci": "Mimus polyglottos", "com": "Northern Mockingbird" }, { "sci": "Sayornis nigricans", "com": "Black Phoebe" }, { "sci": "Larus occidentalis", "com": "Western Gull" }, { "sci": "Corvus brachyrhynchos", "com": "American Crow" }];
  // Bumped whenever the offline sketch build changes, so the browser
  // doesn't keep a stale cache after we regenerate the sketches.
  var SKETCH_VERSION = 'r13'; // r13: added Larus smithsonianus collage masks. r12: 84 eastern NA birds (PR #23) refined + re-cut. r11: full library restyle: every species
  // re-rendered (perched + flight) with clean cutouts.
  // Cache-bust for /api/img - bump whenever a bird gets re-rendered via
  // /api/regen or whenever you need every CF DC to drop its cached copy.
  // Cloudflare keys on the full URL incl. query, so bumping this is
  // equivalent to a global cache purge for /api/img. (caches.default
  // .delete() in the worker only affects ONE colo at a time, so a
  // versioned URL is the only reliable way to invalidate everywhere.)
  var IMG_VERSION = 'r13'; // r13: added Larus smithsonianus collage masks. r12: 84 eastern NA birds (PR #23) refined + re-cut. r11: full library restyle: every species re-rendered
  // with clean cutouts, so drop every cached copy.

  // ---- Sliding pill helper ----
  // Each segmented control has a single .seg-pill element that we move via
  // transform/width to whichever button currently has aria-current="true".
  // This gives an iOS-style smooth slide instead of a hard snap.
  function syncPill(container) {
    var pill = container.querySelector('.seg-pill');
    var active = container.querySelector('button[aria-current="true"]');
    if (!pill || !active) return;
    // offsetLeft is relative to the container (we set position:relative on it).
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }

  // Clicking the open space of a segmented toggle (not a specific option)
  // advances to the next available option, cycling. Clicking an option
  // still jumps straight to it - we just synthesize a click on the next
  // button so its existing handler runs.
  function wireToggleAdvance(container) {
    if (!container || container.__advanceWired) return;
    container.__advanceWired = true;
    container.addEventListener('click', function (ev) {
      if (ev.target.closest('button')) return;   // a specific option was clicked
      var btns = [].slice.call(container.querySelectorAll('button')).filter(function (b) {
        return !b.disabled && b.getAttribute('data-unavailable') !== 'true';
      });
      if (btns.length < 2) return;
      var cur = -1;
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('aria-current') === 'true') { cur = i; break; }
      }
      btns[(cur + 1) % btns.length].click();
    });
  }

  // ---- Slider ----
  var views = document.getElementById('views');
  var slider = document.getElementById('slider');
  var btns = [].slice.call(slider.querySelectorAll('button'));
  var winPick = document.getElementById('winPick');

  // Each view's title text. The shared static-head shows one of these
  // based on the current view; identical adjacent values mean the title
  // stays put with no fade (collage and stats both say Observed Recently).
  var VIEW_TITLES = ['Observed Recently', 'Observed Recently', 'Avian Visitors'];
  var staticHead = document.querySelector('.static-head');
  var staticTitle = document.getElementById('staticTitle');
  var staticLocation = document.getElementById('staticLocation');
  var locationNudge = document.getElementById('location-nudge');
  if (locationNudge) {
    setTimeout(function () {
      locationNudge.classList.add('show');
      setTimeout(function () { locationNudge.classList.remove('show'); }, 3000);
    }, 500);
  }
  function setTitleForView(i) {
    var next = VIEW_TITLES[i];
    if (!staticTitle || staticTitle.textContent === next) return;
    // Fade out -> swap text -> fade in. The opacity transition is 240ms;
    // we swap at ~half that so the eye doesn't catch the text change.
    staticHead.classList.add('swap-out');
    setTimeout(function () {
      staticTitle.textContent = next;
      // Force reflow before removing class so the transition restarts.
      void staticHead.offsetWidth;
      staticHead.classList.remove('swap-out');
    }, 220);
  }

  // The views slide horizontally over SLIDE_MS (see .views transition). For
  // stats + atlas we hold the load-in hidden until the slide has essentially
  // settled, so you watch the content populate *in* the view rather than it
  // finishing mid-slide. The lead is a touch under SLIDE_MS so the cascade
  // begins just as the view arrives - no dead pause, still snappy. Collage's
  // bloom reads fine mid-slide, so it starts immediately (no lead). Stats
  // reads as starting a hair slower than atlas, so it gets a shorter lead.
  var SLIDE_MS = 480;
  var SWITCH_LEAD = SLIDE_MS - 100;   // atlas
  var STATS_LEAD = SLIDE_MS - 200;    // stats - begin a touch sooner
  var currentView = 0;                // collage shows first (no go() needed)
  function go(i) {
    i = Math.max(0, Math.min(2, i));
    // Only a genuine view *switch* replays the entrance. go() also fires when
    // a card is expanded (it sets the #sci= hash, which routes through go(2))
    // while already on the atlas - that must not retrigger the load-in.
    var switching = (i !== currentView);
    currentView = i;
    views.style.transform = 'translateX(-' + (i * 100) + '%)';
    btns.forEach(function (b, j) { b.setAttribute('aria-current', j === i ? 'true' : 'false'); });
    syncPill(slider);
    setTitleForView(i);
    if (!switching) return;
    // Replay the view's entrance animation on switch (collage bloom,
    // stats left-to-right, atlas row-by-row).
    if (i === 0) playCollageEntrance();
    else if (i === 1) playStatsEntrance(STATS_LEAD);
    else if (i === 2) playAtlasEntrance(SWITCH_LEAD);
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { go(+b.dataset.i); }); });

  // ---- Window picker ----
  // Persist selections across reloads so a returning visitor lands on the
  // same view they left. Keys are namespaced so a future schema change
  // can be invalidated by bumping the prefix.
  function readLS(k, fallback) { try { return localStorage.getItem(k) || fallback; } catch (e) { return fallback; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  // ---- Theme (light / charcoal dark) ----
  // A per-device preference (localStorage), applied as data-theme on
  // <html>. An inline script in index.html sets it before first paint to
  // avoid a flash; this keeps it in sync and powers the Settings switcher.
  function applyTheme(name) {
    var t = name === 'dark' ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    writeLS('bird:theme', t);
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  applyTheme(readLS('bird:theme', 'light'));
  var winBtns = [].slice.call(winPick.querySelectorAll('button'));
  var DEFAULT_WINDOW_HOURS = 24;
  var currentHours = +readLS('bird:window', String(DEFAULT_WINDOW_HOURS)) || DEFAULT_WINDOW_HOURS;
  // Older builds used 1,000,000 hours for an unbounded "ALL" option.
  // Map that persisted value to eBird's 30-day observation limit.
  if (currentHours >= 1000000) currentHours = 30 * 24;
  // If a stale or unsupported value was persisted, start on the documented
  // default instead of leaving the picker with no active option.
  if (!winBtns.some(function (b) { return +b.dataset.h === currentHours; })) {
    currentHours = DEFAULT_WINDOW_HOURS;
  }
  winBtns.forEach(function (b) {
    b.setAttribute('aria-current', (+b.dataset.h === currentHours) ? 'true' : 'false');
  });
  winBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      winBtns.forEach(function (x) { x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
      currentHours = +b.dataset.h;
      writeLS('bird:window', String(currentHours));
      syncPill(winPick);
      // Actual data refresh is wired below via refreshRecent().
    });
  });

  // Initial pill placement (after layout settles) + on resize.
  // Atlas sort segmented control - same pill-on-recess pattern.
  var atlasSortEl = document.getElementById('atlasSort');
  var atlasSortBtns = atlasSortEl ? [].slice.call(atlasSortEl.querySelectorAll('button')) : [];
  window.__atlasSort = readLS('bird:atlasSort', 'count');
  atlasSortBtns.forEach(function (b) {
    b.setAttribute('aria-current', (b.dataset.sort === window.__atlasSort) ? 'true' : 'false');
  });
  atlasSortBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      atlasSortBtns.forEach(function (x) { x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
      window.__atlasSort = b.dataset.sort;
      writeLS('bird:atlasSort', window.__atlasSort);
      syncPill(atlasSortEl);
      // Re-render the atlas with new sort, replaying the row-by-row
      // cascade so a filter change reads as a fresh stack load-in.
      renderAtlas(true);
    });
  });

  // Open-space click advances these segmented toggles to the next option.
  wireToggleAdvance(slider);
  wireToggleAdvance(winPick);
  wireToggleAdvance(atlasSortEl);
  wireToggleAdvance(document.getElementById('modalPoseToggle'));
  function syncAllPills() { syncPill(slider); syncPill(winPick); if (atlasSortEl) syncPill(atlasSortEl); }
  // The buttons size from text content; wait for fonts so width is correct.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncAllPills);
  }
  // Also sync after layout is definitely done.
  requestAnimationFrame(function () { requestAnimationFrame(syncAllPills); });
  var pillTimer;
  window.addEventListener('resize', function () {
    clearTimeout(pillTimer);
    pillTimer = setTimeout(syncAllPills, 80);
  });

  // ---- Raster-bitmask collage with bird-shaped nesting ----
  // Each species ships a low-res binary alpha mask (cutout_masks.ts) that
  // matches the bird's actual outline. The layout maintains an occupancy
  // grid at viewport resolution; for each tile we spiral outward from the
  // cluster centre and pick the closest position where the tile's mask
  // doesn't overlap any already-placed mask. Result: birds nest into each
  // other's concavities (wing arc cradles tail, etc.) with a small visual
  // gap baked into the mask via Python-side dilation. No bbox overlap, no
  // rectangles touching - actual polygon-aware packing.

  var collage = document.getElementById('collage');
  // DIMS[slug]=[w,h] (aspect) and MASKS[slug]={w,h,bits} (1-bit silhouette)
  // are built offline by scripts/build_masks.py and fetched from dims.json /
  // masks.json at load. They live in their own files (one key per line) so a
  // species-add is a clean diff and two contributors' additions don't collide,
  // instead of rewriting one ~800KB line and conflicting on every merge.
  var DIMS = {}, MASKS = {}, tablesReady = false;
  (function loadTables() {
    var q = '?v=' + SKETCH_VERSION;
    Promise.all([
      fetch('./dims.json' + q).then(function (r) { return r.json(); }),
      fetch('./masks.json' + q).then(function (r) { return r.json(); })
    ]).then(function (t) {
      DIMS = t[0]; MASKS = t[1]; tablesReady = true;
      // renderCollage defers its first pack until the silhouettes exist (see
      // the tablesReady gate); render now that they are here.
      try { renderCollageFromData(); } catch (e) { }
    }).catch(function (e) {
      // Leave tablesReady false so renderCollage keeps waiting rather than
      // packing with no silhouettes. The empty-nest state still renders.
      if (window.console) console.error('collage: dims/masks failed to load', e);
    });
  })();

  // Tunables - Galliformes-poster-inspired. Raster-mask nesting.
  //
  // Layout discipline: tile areas are NORMALISED against a viewport
  // budget (sum of areas ≈ packingBudgetFrac × vpArea) rather than
  // each tile being clamped to a per-tile maxArea. The old per-tile
  // cap made every loud bird look identical (Anna n=398, Crow n=31
  // and Phoebe n=26 all hit ceiling and rendered the same size) AND
  // it allowed total area to overflow narrow viewports so birds got
  // dropped off-screen. Normalising fixes both - relative size
      // tracks the relative observation ratio, and total area can never exceed
  // what the iterative shrink loop is willing to scale into the
  // viewport.
  function tuning(n) {
    return {
      // Soft area budget the whole cluster aims to fill, as a
      // fraction of viewport area. Lower = sparser collage with more
      // breathing room (and more headroom for packing efficiency).
      // Steps down as species count grows so a busy plate doesn't
      // try to claim the entire viewport.
      packingBudgetFrac: n <= 4 ? 0.72 :
        n <= 12 ? 0.66 :
          n <= 24 ? 0.58 :
            0.50,
      // Count -> area exponent. ~0.65 keeps the visual hierarchy
      // legible (n=400 reads ~5× bigger than n=30) without the
      // loudest bird drowning everything else.
      countExp: 0.65,
      // Floor: every species in the dataset must be visible, even
      // n=1. Tracks species count so a tiny rare bird stays
      // recognisable on a crowded plate.
      minTileAreaFrac: n <= 8 ? 0.0100 :
        n <= 20 ? 0.0075 :
          0.0055,
      // Wider clusters for landscape viewports, more so as n grows.
      ellipseAspectBias: 2.1,
    };
  }
  var GRID_STRIDE = 4; // viewport px per occupancy cell; smaller = slower
  var COLLAGE_PAD = 3; // breathing room (grid cells) around each bird;
  // eased on narrow screens where birds are smaller.
  var FLY_PROB = 0.15; // chance a bird shows in its flight pose (rare); perched
  // otherwise. Rolled once per window appearance.
  var collagePose = {}; // sci -> 1 perched | 2 flight, persisted across polls;
  // cleared when a bird leaves the window so it rerolls.

  // Decode and cache each mask once. Sparse cell-list form (only "on"
  // cells) makes collision tests linear in opaque area, not total area.
  var maskCache = {};
  function loadMask(slug) {
    if (maskCache[slug]) return maskCache[slug];
    var rec = MASKS[slug];
    if (!rec) return null;
    var bytes = atob(rec.bits);
    var w = rec.w, h = rec.h;
    var cells = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var b = bytes.charCodeAt(i >> 3);
        if ((b >> (7 - (i & 7))) & 1) cells.push([x, y]);
      }
    }
    return (maskCache[slug] = { w: w, h: h, cells: cells });
  }

  function slugify(sci) {
    return sci.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function aspect(sci) {
    var d = DIMS[slugify(sci)];
    return d ? d[0] / d[1] : 1.4;
  }

  // Mask-aware nester. tiles: { fullW, fullH, mask, data }. Returns the
  // same tiles with .x, .y assigned (top-left in viewport coords).
  function maskPack(tiles, W, H, xBias, yBias, pad) {
    var GW = Math.ceil(W / GRID_STRIDE) + 2;
    var GH = Math.ceil(H / GRID_STRIDE) + 2;
    var grid = new Uint8Array(GW * GH);

    function cellRange(tile, tx, ty, c) {
      // For mask cell (c[0], c[1]), return [gx0, gy0, gx1, gy1] (inclusive)
      // in grid coords, clamped to the grid.
      var sx = tile.fullW / tile.mask.w;
      var sy = tile.fullH / tile.mask.h;
      var x0 = (tx + c[0] * sx) / GRID_STRIDE | 0;
      var y0 = (ty + c[1] * sy) / GRID_STRIDE | 0;
      var x1 = (tx + (c[0] + 1) * sx) / GRID_STRIDE | 0;
      var y1 = (ty + (c[1] + 1) * sy) / GRID_STRIDE | 0;
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
      if (x1 >= GW) x1 = GW - 1; if (y1 >= GH) y1 = GH - 1;
      return [x0, y0, x1, y1];
    }
    function collides(tile, tx, ty) {
      var cells = tile.mask.cells;
      for (var i = 0; i < cells.length; i++) {
        var r = cellRange(tile, tx, ty, cells[i]);
        for (var gy = r[1]; gy <= r[3]; gy++) {
          var off = gy * GW;
          for (var gx = r[0]; gx <= r[2]; gx++) {
            if (grid[off + gx]) return true;
          }
        }
      }
      return false;
    }
    function stamp(tile, tx, ty) {
      var cells = tile.mask.cells;
      for (var i = 0; i < cells.length; i++) {
        var r = cellRange(tile, tx, ty, cells[i]);
        // Dilate the stamped footprint by `pad` cells so the next bird can't
        // pack right up against this one - a uniform gap around every
        // silhouette. collides() stays unpadded, so the gap is added once.
        var gy0 = r[1] - pad, gy1 = r[3] + pad;
        var gx0 = r[0] - pad, gx1 = r[2] + pad;
        if (gy0 < 0) gy0 = 0; if (gx0 < 0) gx0 = 0;
        if (gy1 >= GH) gy1 = GH - 1; if (gx1 >= GW) gx1 = GW - 1;
        for (var gy = gy0; gy <= gy1; gy++) {
          var off = gy * GW;
          for (var gx = gx0; gx <= gx1; gx++) grid[off + gx] = 1;
        }
      }
    }
    function offGrid(tile, tx, ty) {
      // True if the rendered tile bbox extends past the viewport.
      return tx < 0 || ty < 0 || tx + tile.fullW > W || ty + tile.fullH > H;
    }

    var cx = W / 2, cy = H / 2;
    // Largest first so the cluster grows around the anchor.
    tiles.sort(function (a, b) { return (b.fullW * b.fullH) - (a.fullW * a.fullH); });
    var placed = [];
    // Seeded PRNG keeps the layout stable across resizes.
    var seed = 0x9E3779B9;
    function rand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var tx, ty;
      if (i === 0) {
        tx = cx - t.fullW / 2;
        ty = cy - t.fullH / 2;
        t.x = tx; t.y = ty;
        stamp(t, tx, ty);
        placed.push(t);
        continue;
      }
      // Spiral outward. Stop the first ring that yields any non-colliding
      // position - that ring is the tightest possible distance from
      // centre. Within the ring, pick the position closest to the centre
      // of mass of already-placed tiles (so cluster grows organically,
      // not in fixed directions).
      var comX = 0, comY = 0, comW = 0;
      placed.forEach(function (p) {
        var a = p.fullW * p.fullH;
        comX += (p.x + p.fullW / 2) * a;
        comY += (p.y + p.fullH / 2) * a;
        comW += a;
      });
      comX /= comW; comY /= comW;

      var best = null, bestCost = Infinity;
      var step = Math.max(GRID_STRIDE, Math.min(t.fullW, t.fullH) * 0.05);
      var maxR = Math.max(W, H);
      var foundRing = -1;
      var phase = rand() * Math.PI * 2;
      for (var r = 0; r <= maxR; r += step) {
        if (foundRing >= 0 && r > foundRing + step * 2) break;
        var samples = Math.max(36, Math.floor(r / 1.6));
        for (var k = 0; k < samples; k++) {
          var theta = phase + (k / samples) * Math.PI * 2;
          // Elliptical ring - stretched per axis: xBias>yBias gives a wide
          // (landscape) cluster, yBias>xBias a tall (portrait) one.
          var px = cx + r * xBias * Math.cos(theta) - t.fullW / 2;
          var py = cy + r * yBias * Math.sin(theta) - t.fullH / 2;
          if (offGrid(t, px, py)) continue;
          if (collides(t, px, py)) continue;
          // Distance to existing cluster centre of mass + small noise.
          var dxx = (px + t.fullW / 2 - comX);
          var dyy = (py + t.fullH / 2 - comY);
          var cost = Math.hypot(dxx / xBias, dyy / yBias) + rand() * step * 0.5;
          if (cost < bestCost) { bestCost = cost; best = { x: px, y: py }; }
        }
        if (best && foundRing < 0) foundRing = r;
      }
      if (best) {
        t.x = best.x; t.y = best.y;
        stamp(t, best.x, best.y);
        placed.push(t);
      } else {
        // Couldn't fit anywhere - hide off-screen rather than overlap.
        t.x = -99999; t.y = -99999;
        placed.push(t);
      }
    }
    return placed;
  }

  function renderCollage(items, animate) {
    collage.innerHTML = '';
    // Drop the previous render's hit-test tiles up front so a click or hover on
    // the empty-nest state (or a collage that hasn't laid out yet) resolves to
    // nothing, not to a stale bird from the last populated render. The populated
    // path repopulates collagePlaced once the new tiles are placed.
    collagePlaced = [];
    collageHovered = null;
    if (!items.length) {
      // No birds observed yet: show an empty nest where the collage would be, with
      // the status line beneath it. The frame (shoot.py) overrides the .empty
      // text for the e-ink panel; the nest illustration is shared by both.
      collage.innerHTML = '<div class="empty-nest">' +
        '<img class="nest-img" src="nest.webp" alt="an empty nest" decoding="async">' +
        '<p class="empty">no birds observed in this window.</p></div>';
      // Bloom the nest in on the same cues as the collage (first load, window
      // change, view switch); a silent poll/resize renders without animate. The
      // class self-clears after the worst case so a throttled tab still ends
      // with the nest visible, mirroring the tile entrance's safety net.
      if (animate) {
        var enest = collage.firstChild;
        enest.classList.add('entering');
        clearTimeout(collageEntranceT);
        collageEntranceT = setTimeout(function () { enest.classList.remove('entering'); }, 900);
      }
      return;
    }
    // Silhouettes (DIMS/MASKS) load async from dims.json/masks.json; until
    // they arrive we cannot pack. Defer and retry, like the !W/!H case below.
    // (The empty-nest path above needs no silhouettes and already returned.)
    if (!tablesReady) { setTimeout(function () { renderCollage(items, animate); }, 80); return; }
    var W = collage.clientWidth, H = collage.clientHeight;
    if (!W || !H) { setTimeout(function () { renderCollage(items, animate); }, 80); return; }

    // Tuning depends on bird count - same viewport, very different
    // pack densities for 6 vs 48 birds.
    var T = tuning(items.length);
    var vpArea = W * H;
    var budget = vpArea * T.packingBudgetFrac;
    var minArea = vpArea * T.minTileAreaFrac;

    // Step 1: build tiles + assign each a count-weighted SCORE (not a
    // final area yet). area-from-count uses a sub-linear exponent so
    // a 400-observation bird is visibly larger than a 30-observation bird
    // without dwarfing it.
    var tiles = items.map(function (s) {
      var base = slugify(s.sci);
      // Pose: perched by default, rarely flight (FLY_PROB), and only if a
      // flight render exists. Flight uses the <slug>-2 mask/aspect/image so
      // the wings-spread silhouette nests correctly.
      var pose = collagePose[s.sci];
      if (pose === undefined) {
        pose = (DIMS[base + '-2'] && Math.random() < FLY_PROB) ? 2 : 1;
        collagePose[s.sci] = pose;
      }
      var slug = pose === 2 ? base + '-2' : base;
      var mask = loadMask(slug);
      if (!mask && pose === 2) { pose = 1; slug = base; mask = loadMask(slug); collagePose[s.sci] = 1; }
      if (!mask) return null;
      var d = DIMS[slug];
      var n = +s.n; if (!n || isNaN(n)) n = 1;
      return {
        mask: mask, data: s, pose: pose,
        ar: d ? d[0] / d[1] : 1.4,
        score: Math.pow(Math.max(1, n), T.countExp),
      };
    }).filter(Boolean);
    // Reroll on re-entry: forget pose choices for species no longer in window.
    var present = {}; items.forEach(function (s) { present[s.sci] = 1; });
    Object.keys(collagePose).forEach(function (k) { if (!present[k]) delete collagePose[k]; });

    // Step 2: normalise so sum(area) ≈ budget. Then floor each tile
    // at minArea so even a 1-observation bird stays legible.
    var sumScore = tiles.reduce(function (a, t) { return a + t.score; }, 0) || 1;
    tiles.forEach(function (t) {
      t.area = Math.max(minArea, budget * t.score / sumScore);
    });
    // After flooring, total may exceed budget; squeeze the over-budget
    // remainder out of the LARGER tiles (the ones above minArea) so
    // the floor on rare birds stays intact.
    var sumA = tiles.reduce(function (a, t) { return a + t.area; }, 0);
    if (sumA > budget) {
      var fixedSum = tiles.filter(function (t) { return t.area <= minArea + 1e-9; })
        .reduce(function (a, t) { return a + t.area; }, 0);
      var flexSum = sumA - fixedSum;
      var flexBudget = Math.max(0, budget - fixedSum);
      var shrink = flexSum > 0 ? Math.min(1, flexBudget / flexSum) : 1;
      tiles.forEach(function (t) {
        if (t.area > minArea + 1e-9) t.area *= shrink;
      });
    }
    // Step 3: derive width/height from area + per-species aspect.
    tiles.forEach(function (t) {
      t.fullW = Math.sqrt(t.area * t.ar);
      t.fullH = t.fullW / t.ar;
    });

    // Width-responsive: wide screens get a horizontal ellipse at full padding;
    // narrow/portrait screens a vertical ellipse with slightly tighter padding.
    var narrow = W <= 700;
    var xBias = narrow ? 1 : T.ellipseAspectBias;
    var yBias = narrow ? 1.7 : 1;   // gentler than the desktop bias so the
    // portrait cluster stays a bit wider / less tall
    var pad = narrow ? Math.max(1, COLLAGE_PAD - 1) : COLLAGE_PAD;
    var placed = maskPack(tiles, W, H, xBias, yBias, pad);

    // Scale-to-fit: iterate shrink + repack until every tile lands on
    // screen. The old single-pass version dropped birds when one pass
    // wasn't enough (narrow viewports + many species). Capped at 10
    // iterations - by then the linear scale is ~0.5 of original, more
    // than enough headroom for any viewport.
    function clusterBounds(arr) {
      var L = Infinity, R = -Infinity, T2 = Infinity, B = -Infinity;
      arr.forEach(function (t) {
        if (t.x < -1000) return;
        if (t.x < L) L = t.x;
        if (t.x + t.fullW > R) R = t.x + t.fullW;
        if (t.y < T2) T2 = t.y;
        if (t.y + t.fullH > B) B = t.y + t.fullH;
      });
      return { L: L, R: R, T: T2, B: B };
    }
    var b = clusterBounds(placed);
    for (var iter = 0; iter < 10; iter++) {
      var missing = placed.some(function (t) { return t.x < -1000; });
      var overflow = b.L < 0 || b.T < 0 || b.R > W || b.B > H;
      if (!missing && !overflow) break;
      // Base 0.93 linear shrink (≈ 0.86 area). If overflow, take the
      // tighter of cluster-to-viewport ratios so we converge fast.
      var scale = 0.93;
      if (overflow) {
        var clW = b.R - b.L, clH = b.B - b.T;
        var sx = (W * 0.96) / Math.max(clW, W * 0.96);
        var sy = (H * 0.94) / Math.max(clH, H * 0.94);
        scale = Math.min(scale, sx, sy);
      }
      tiles.forEach(function (t) { t.fullW *= scale; t.fullH *= scale; });
      placed = maskPack(tiles, W, H, xBias, yBias, pad);
      b = clusterBounds(placed);
    }

    // Re-centre the cluster in the viewport so a small cluster doesn't
    // drift to one side from the spiral's center-of-mass bias.
    var dx = W / 2 - (b.L + b.R) / 2;
    var dy = H / 2 - (b.T + b.B) / 2;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      placed.forEach(function (t) { if (t.x > -1000) { t.x += dx; t.y += dy; } });
    }

    placed.forEach(function (r) {
      var s = r.data;
      // com flows through so the worker's JIT Gemini job uses the right
      // common name in its prompt for a freshly-observed species.
      // &v=IMG_VERSION busts CF edge cache when we re-render any species.
      var img = apiUrl('/avian/api/cutout.php?sci=') + encodeURIComponent(s.sci) +
        (s.com ? '&com=' + encodeURIComponent(s.com) : '') +
        (r.pose === 2 ? '&pose=2' : '') +
        '&v=' + IMG_VERSION;
      var btn = document.createElement('button');
      btn.className = 'gtile';
      btn.type = 'button';
      btn.setAttribute('data-sci', s.sci);
      btn.setAttribute('aria-label', s.com);
      // Fallback for keyboard / screen-reader users - the visible hover
      // pill below is the primary affordance for sighted mouse users.
      // eBird's howMany value represents observed birds in the record.
      var titleN = +s.n || 0;
      btn.title = (s.com || s.sci) + ' · ' + fmtN(titleN) + ' ' +
        (titleN === 1 ? 'observation' : 'observations') + ' ' + windowLabel(currentHours);
      btn.style.left = r.x + 'px';
      btn.style.top = r.y + 'px';
      btn.style.width = r.fullW + 'px';
      btn.style.height = r.fullH + 'px';
      btn.innerHTML = '<img loading="lazy" decoding="async" src="' + img + '" alt="' + s.com + '">';
      r.el = btn;
      collage.appendChild(btn);
    });
    // Hover pill - created once per render so collage.innerHTML='' at
    // the top of this function doesn't strand a stale node. mousemove
    // populates its text from hit.data so the count is whatever the
    // current window's data says.
    var tip = document.createElement('div');
    tip.id = 'collageTip';
    tip.className = 'collage-tip';
    tip.setAttribute('aria-hidden', 'true');
    collage.appendChild(tip);
    // Stash the placed tiles so the alpha-mask hit-tester (below) can
    // resolve which silhouette the cursor is actually over.
    collagePlaced = placed.filter(function (t) { return t.x > -1000; });

    // Bloom the birds in from the centre outward, but only when asked
    // (first load, window change, view switch) - never on the silent 30s
    // poll or a resize, which render without the animate flag.
    if (animate) playCollageEntrance();
  }

  // Staggered centre-out entrance: each tile fades + scales in, delayed by
  // its distance from the collage centre, so the flock blooms from the
  // middle out. Re-applied with a reflow reset so it can replay on demand
  // (e.g. switching back to the collage view).
  var collageEntranceT = null;
  function playCollageEntrance() {
    var tiles = [].slice.call(collage.querySelectorAll('.gtile'));
    if (!tiles.length) return;
    var cx = collage.clientWidth / 2, cy = collage.clientHeight / 2;
    var maxD = 1;
    var info = tiles.map(function (t) {
      var d = Math.hypot((t.offsetLeft + t.offsetWidth / 2) - cx,
        (t.offsetTop + t.offsetHeight / 2) - cy);
      if (d > maxD) maxD = d;
      return { el: t, d: d };
    });
    var SPREAD = 520;   // ms from the centre bird to the outermost
    info.forEach(function (o) {
      o.el.classList.remove('entering');
      o.el.style.animationDelay = ((o.d / maxD) * SPREAD).toFixed(0) + 'ms';
    });
    void collage.offsetWidth;   // commit the reset so the animation replays
    info.forEach(function (o) { o.el.classList.add('entering'); });
    // Safety net: the keyframe starts the tiles hidden (backwards fill), so
    // if the animation never advances (a backgrounded/throttled tab where
    // CSS animation time is frozen), strip the class after the bloom's
    // worst-case duration so the birds always end visible. A no-op when the
    // animation ran normally - it's already at the base (visible) state.
    clearTimeout(collageEntranceT);
    collageEntranceT = setTimeout(function () {
      info.forEach(function (o) { o.el.classList.remove('entering'); o.el.style.animationDelay = ''; });
    }, SPREAD + 520);
  }

  // Atlas entrance: cards rise + fade in row by row, top to bottom. Cards
  // sharing an offsetTop are one row, so they appear together; each row
  // down adds a small delay (capped so a long atlas doesn't crawl).
  var atlasEntranceT = null;
  // lead: ms to hold every card hidden before the cascade starts. On a view
  // switch this is set to ~the view-slide duration so the row-by-row load-in
  // begins as the view settles (not while it's still sliding in). The cards'
  // `backwards` fill keeps them hidden during the lead, so there's no flash.
  // In-place re-renders (sort change) pass no lead - they fire immediately.
  function playAtlasEntrance(lead) {
    lead = lead || 0;
    var grid = document.getElementById('atlasGrid');
    if (!grid) return;
    var cards = [].slice.call(grid.querySelectorAll('.bird-card'));
    if (!cards.length) return;
    var uniqTops = cards.map(function (c) { return c.offsetTop; })
      .sort(function (a, b) { return a - b; })
      .filter(function (v, i, a) { return i === 0 || v !== a[i - 1]; });
    var rowOf = {}; uniqTops.forEach(function (t, i) { rowOf[t] = i; });
    // Each row trails the one above by PER_ROW ms. At 90ms against the 480ms
    // card animation the rows clearly cascade top-to-bottom (a row starts when
    // the one above is ~1/5 in) instead of reading as one simultaneous fade.
    // MAX_ROW caps the stagger so off-screen rows don't crawl.
    var PER_ROW = 90, MAX_ROW = 10;
    cards.forEach(function (c) {
      c.classList.remove('entering');
      c.style.animationDelay = (lead + Math.min(rowOf[c.offsetTop] || 0, MAX_ROW) * PER_ROW) + 'ms';
    });
    void grid.offsetWidth;
    cards.forEach(function (c) { c.classList.add('entering'); });
    clearTimeout(atlasEntranceT);
    atlasEntranceT = setTimeout(function () {
      cards.forEach(function (c) { c.classList.remove('entering'); c.style.animationDelay = ''; });
    }, lead + MAX_ROW * PER_ROW + 540);
  }

  // Stats entrance: timeline columns fade in left -> right (by their x
  // position), with the side panel fading in just behind. Opacity only.
  var statsEntranceT = null;
  // lead: see playAtlasEntrance. On a view switch the whole graph is held
  // hidden until the slide settles, then populates left-to-right; in-place
  // re-renders (window-picker change) pass no lead and animate immediately.
  function playStatsEntrance(lead) {
    lead = lead || 0;
    var plot = document.querySelector('.stats-tl-plot');
    if (!plot) return;
    var SPREAD = 460;
    // The whole graph populates left-to-right: columns, gridlines and
    // x-ticks stagger by their x%; the y-axis leads (delay 0) and the side
    // panel trails. animationDelay carries the per-element offset.
    var items = [].slice.call(plot.querySelectorAll('.stats-tl-col, .stats-tl-gridline, .stats-tl-xtick'))
      .map(function (el) { return { el: el, d: ((parseFloat(el.style.left) || 0) / 100) * SPREAD }; });
    var yaxis = document.querySelector('.stats-tl-yaxis');
    if (yaxis) items.push({ el: yaxis, d: 0 });
    // Side panel loads in tandem: section headers + captions lead, then
    // their rows populate top-to-bottom over the same window as the graph.
    var side = document.querySelector('.stats-side');
    if (side) {
      [].slice.call(side.querySelectorAll('h3, small')).forEach(function (el) { items.push({ el: el, d: 40 }); });
      var rows = [].slice.call(side.querySelectorAll('li'));
      rows.forEach(function (el, i) { items.push({ el: el, d: 80 + (i / Math.max(1, rows.length - 1)) * SPREAD }); });
    }
    items.forEach(function (o) { o.el.classList.remove('entering'); o.el.style.animationDelay = Math.round(lead + o.d) + 'ms'; });
    void plot.offsetWidth;
    items.forEach(function (o) { o.el.classList.add('entering'); });
    clearTimeout(statsEntranceT);
    statsEntranceT = setTimeout(function () {
      items.forEach(function (o) { o.el.classList.remove('entering'); o.el.style.animationDelay = ''; });
    }, lead + SPREAD + 560);
  }

  // ---- Alpha-mask hover/click hit-testing ----
  // The .gtile buttons are rectangles and their bounding boxes overlap
  // (tight nesting). A plain :hover would light up whichever rectangle
  // is on top - often not the bird under the cursor. So we hit-test
  // the cursor against each tile's binary alpha mask and only the
  // genuinely-hit silhouette gets .is-hover / receives the click.
  var collagePlaced = [];
  var collageHovered = null;
  function maskHitTest(clientX, clientY) {
    var box = collage.getBoundingClientRect();
    var px = clientX - box.left, py = clientY - box.top;
    // Iterate topmost-first (later in DOM = painted on top).
    for (var i = collagePlaced.length - 1; i >= 0; i--) {
      var t = collagePlaced[i];
      if (px < t.x || py < t.y || px > t.x + t.fullW || py > t.y + t.fullH) continue;
      var mx = ((px - t.x) / t.fullW * t.mask.w) | 0;
      var my = ((py - t.y) / t.fullH * t.mask.h) | 0;
      // Build a fast lookup set once per mask.
      if (!t.mask._set) {
        var set = {};
        var cells = t.mask.cells;
        for (var c = 0; c < cells.length; c++) set[cells[c][0] + '|' + cells[c][1]] = 1;
        t.mask._set = set;
      }
      if (t.mask._set[mx + '|' + my]) return t;
    }
    return null;
  }
  collage.addEventListener('mousemove', function (ev) {
    var hit = maskHitTest(ev.clientX, ev.clientY);
    if (hit === collageHovered) return;
    if (collageHovered && collageHovered.el) collageHovered.el.classList.remove('is-hover');
    collageHovered = hit;
    if (hit && hit.el) hit.el.classList.add('is-hover');
    collage.style.cursor = hit ? 'pointer' : 'default';
    var tip = document.getElementById('collageTip');
    if (tip) {
      if (hit) {
        var s = hit.data;
        var n = +s.n || 0;
        var noun = (n === 1) ? 'observation' : 'observations';
        tip.innerHTML = '<span class="ct-name">' + (s.com || s.sci) + '</span>'
          + '<span class="ct-w"> - </span>'
          + '<span class="ct-n">' + fmtN(n) + '</span>'
          + '<span class="ct-w"> ' + noun + ' ' + windowLabel(currentHours) + '</span>';
        tip.setAttribute('aria-hidden', 'false');
      } else {
        tip.setAttribute('aria-hidden', 'true');
      }
    }
  });
  collage.addEventListener('mouseleave', function () {
    if (collageHovered && collageHovered.el) collageHovered.el.classList.remove('is-hover');
    collageHovered = null;
    var tip = document.getElementById('collageTip');
    if (tip) tip.setAttribute('aria-hidden', 'true');
  });
  collage.addEventListener('click', function (ev) {
    var hit = maskHitTest(ev.clientX, ev.clientY);
    if (!hit) return;
    location.hash = '#sci=' + encodeURIComponent(hit.data.sci);
    go(2);
  });

  // Debug hook - call __layout({ slugs, weights, n }) from devtools to
  // re-render the collage with a custom item set. Lets us prove the
  // nester handles 6/12/24/48 birds and varied size hierarchies without
  // touching the source.
  window.__layout = function (opts) {
    opts = opts || {};
    var allSlugs = Object.keys({ "acanthis-flammea": [560, 372], "accipiter-cooperii": [558, 560], "accipiter-gentilis": [558, 560], "accipiter-striatus": [375, 560], "actitis-macularius": [560, 409], "aechmophorus-occidentalis": [525, 560], "aegolius-acadicus": [560, 558], "aeronautes-saxatalis": [560, 439], "agelaius-phoeniceus": [276, 560], "aix-sponsa": [560, 378], "ammodramus-savannarum": [560, 436], "amphispiza-bilineata": [560, 559], "anas-crecca": [560, 288], "anas-platyrhynchos": [558, 560], "anser-albifrons": [560, 439], "anthus-rubescens": [375, 560], "aphelocoma-californica": [560, 373], "aphelocoma-woodhouseii": [468, 560], "aquila-chrysaetos": [437, 560], "archilochus-alexandri": [560, 344], "ardea-alba": [560, 465], "ardea-herodias": [560, 373], "artemisiospiza-belli": [560, 435], "asio-flammeus": [560, 560], "asio-otus": [404, 560], "athene-cunicularia": [560, 373], "aythya-affinis": [560, 372], "aythya-americana": [560, 553], "aythya-collaris": [560, 373], "aythya-valisineria": [560, 373], "baeolophus-inornatus": [560, 311], "bombycilla-cedrorum": [339, 560], "bombycilla-garrulus": [560, 559], "branta-canadensis": [560, 559], "bubo-virginianus": [373, 560], "bubulcus-ibis": [267, 560], "bucephala-albeola": [560, 408], "bucephala-clangula": [560, 242], "buteo-jamaicensis": [560, 374], "buteo-lagopus": [560, 244], "buteo-lineatus": [463, 560], "buteo-regalis": [408, 560], "buteo-swainsoni": [560, 408], "butorides-virescens": [555, 560], "calamospiza-melanocorys": [560, 374], "calidris-alba": [560, 371], "calidris-alpina": [560, 374], "callipepla-californica": [560, 372], "calothorax-lucifer": [465, 560], "calypte-anna": [560, 344], "calypte-costae": [560, 409], "cardellina-pusilla": [560, 281], "cardellina-rubrifrons": [527, 560], "cathartes-aura": [376, 560], "catharus-guttatus": [560, 333], "catharus-ustulatus": [560, 408], "catherpes-mexicanus": [320, 560], "certhia-americana": [201, 560], "chaetura-vauxi": [560, 374], "charadrius-vociferus": [560, 408], "chondestes-grammacus": [560, 559], "chordeiles-minor": [560, 319], "cinclus-mexicanus": [560, 465], "circus-hudsonius": [372, 560], "cistothorus-palustris": [437, 560], "coccothraustes-vespertinus": [560, 466], "colaptes-auratus": [560, 560], "columba-livia": [560, 327], "columbina-passerina": [560, 559], "contopus-sordidulus": [560, 502], "coragyps-atratus": [560, 557], "corvus-brachyrhynchos": [560, 503], "corvus-corax": [343, 560], "cyanocitta-stelleri": [363, 560], "cygnus-buccinator": [560, 370], "cypseloides-niger": [560, 356], "dryobates-nuttallii": [560, 321], "dryobates-pubescens": [560, 558], "dryobates-villosus": [268, 560], "dryocopus-pileatus": [492, 560], "egretta-caerulea": [560, 321], "egretta-thula": [560, 374], "elanus-leucurus": [560, 378], "empidonax-difficilis": [268, 560], "empidonax-hammondii": [558, 560], "empidonax-oberholseri": [495, 560], "empidonax-traillii": [371, 560], "empidonax-wrightii": [560, 527], "eremophila-alpestris": [560, 529], "euphagus-cyanocephalus": [560, 371], "falco-columbarius": [560, 408], "falco-mexicanus": [349, 560], "falco-peregrinus": [465, 560], "falco-sparverius": [560, 370], "gavia-immer": [560, 374], "geothlypis-tolmiei": [560, 406], "geothlypis-trichas": [560, 316], "glaucidium-gnoma": [560, 560], "gymnogyps-californianus": [466, 560], "haemorhous-mexicanus": [523, 560], "haemorhous-purpureus": [560, 387], "haliaeetus-leucocephalus": [560, 434], "himantopus-mexicanus": [458, 560], "hirundo-rustica": [560, 410], "hydroprogne-caspia": [560, 373], "icteria-virens": [560, 293], "icterus-bullockii": [560, 214], "icterus-cucullatus": [391, 560], "icterus-galbula": [560, 528], "icterus-parisorum": [560, 266], "ixoreus-naevius": [560, 558], "junco-hyemalis": [560, 320], "lanius-ludovicianus": [408, 560], "larus-californicus": [560, 437], "larus-delawarensis": [560, 376], "larus-glaucescens": [560, 374], "larus-heermanni": [560, 436], "larus-occidentalis": [560, 412], "leiothlypis-celata": [522, 560], "leiothlypis-lucidae": [351, 560], "leucophaeus-atricilla": [560, 373], "leucophaeus-pipixcan": [560, 560], "leucosticte-tephrocotis": [560, 465], "limosa-fedoa": [560, 556], "lophodytes-cucullatus": [560, 409], "loxia-curvirostra": [560, 319], "mareca-americana": [560, 375], "mareca-strepera": [560, 372], "megaceryle-alcyon": [560, 409], "megascops-kennicottii": [560, 374], "melanerpes-formicivorus": [351, 560], "melanerpes-lewis": [372, 560], "meleagris-gallopavo": [560, 373], "melospiza-georgiana": [320, 560], "melospiza-lincolnii": [560, 245], "melospiza-melodia": [560, 352], "melozone-aberti": [560, 268], "melozone-crissalis": [560, 538], "melozone-fusca": [560, 495], "mergus-merganser": [560, 374], "mimus-polyglottos": [560, 310], "mniotilta-varia": [560, 351], "molothrus-ater": [560, 505], "myadestes-townsendi": [560, 436], "myiarchus-cinerascens": [560, 532], "nucifraga-columbiana": [560, 373], "numenius-americanus": [558, 560], "nycticorax-nycticorax": [560, 465], "oreothlypis-ruficapilla": [372, 560], "pandion-haliaetus": [560, 371], "passer-domesticus": [560, 444], "passerculus-sandwichensis": [560, 542], "passerella-iliaca": [560, 350], "passerina-amoena": [560, 465], "passerina-cyanea": [560, 560], "patagioenas-fasciata": [560, 500], "pelecanus-erythrorhynchos": [560, 316], "pelecanus-occidentalis": [560, 406], "perisoreus-canadensis": [560, 349], "petrochelidon-pyrrhonota": [558, 560], "phainopepla-nitens": [560, 464], "phalacrocorax-auritus": [490, 560], "phalaenoptilus-nuttallii": [560, 373], "phasianus-colchicus": [560, 409], "pheucticus-melanocephalus": [559, 560], "pica-nuttalli": [560, 320], "picoides-arcticus": [374, 560], "pinicola-enucleator": [560, 372], "pipilo-chlorurus": [560, 318], "pipilo-erythrophthalmus": [352, 560], "pipilo-maculatus": [443, 560], "piranga-ludoviciana": [293, 560], "piranga-rubra": [560, 495], "plegadis-chihi": [560, 372], "podiceps-nigricollis": [560, 374], "podilymbus-podiceps": [560, 374], "poecile-gambeli": [560, 350], "poecile-rufescens": [560, 339], "polioptila-caerulea": [560, 557], "pooecetes-gramineus": [560, 436], "progne-subis": [313, 560], "psaltriparus-minimus": [560, 428], "quiscalus-mexicanus": [560, 269], "recurvirostra-americana": [268, 560], "regulus-calendula": [496, 560], "regulus-satrapa": [464, 560], "riparia-riparia": [560, 494], "rynchops-niger": [560, 374], "salpinctes-obsoletus": [560, 465], "sayornis-nigricans": [308, 560], "sayornis-saya": [463, 560], "selasphorus-platycercus": [560, 497], "selasphorus-rufus": [560, 436], "selasphorus-sasin": [434, 560], "setophaga-coronata": [461, 560], "setophaga-magnolia": [560, 268], "setophaga-nigrescens": [560, 350], "setophaga-occidentalis": [560, 367], "setophaga-palmarum": [438, 560], "setophaga-petechia": [560, 268], "setophaga-ruticilla": [560, 293], "setophaga-townsendi": [560, 416], "sialia-currucoides": [558, 560], "sialia-mexicana": [560, 371], "sitta-canadensis": [560, 379], "sitta-carolinensis": [436, 560], "sitta-pygmaea": [560, 407], "spatula-clypeata": [560, 408], "spatula-discors": [560, 493], "sphyrapicus-ruber": [560, 558], "sphyrapicus-thyroideus": [374, 560], "spinus-lawrencei": [560, 373], "spinus-pinus": [560, 516], "spinus-psaltria": [560, 548], "spinus-tristis": [536, 560], "spizella-atrogularis": [246, 560], "spizella-breweri": [560, 557], "spizella-passerina": [560, 320], "spizelloides-arborea": [560, 436], "stelgidopteryx-serripennis": [558, 560], "sterna-forsteri": [560, 373], "sterna-hirundo": [560, 411], "streptopelia-decaocto": [560, 393], "strix-occidentalis": [560, 553], "sturnella-neglecta": [320, 560], "sturnus-vulgaris": [560, 545], "tachycineta-bicolor": [375, 560], "tachycineta-thalassina": [560, 435], "thalasseus-elegans": [560, 407], "thryomanes-bewickii": [560, 263], "toxostoma-redivivum": [560, 298], "tringa-semipalmata": [560, 464], "troglodytes-aedon": [560, 494], "troglodytes-pacificus": [560, 407], "turdus-migratorius": [560, 402], "tyrannus-verticalis": [559, 560], "tyrannus-vociferans": [495, 560], "tyto-alba": [560, 464], "urile-penicillatus": [296, 560], "vireo-bellii": [560, 559], "vireo-cassinii": [560, 319], "vireo-gilvus": [464, 560], "vireo-huttoni": [410, 560], "xanthocephalus-xanthocephalus": [293, 560], "zenaida-asiatica": [560, 558], "zenaida-macroura": [522, 560], "zonotrichia-atricapilla": [560, 238], "zonotrichia-leucophrys": [560, 313], "zonotrichia-querula": [560, 294] });
    var slugs = opts.slugs || allSlugs.slice(0, opts.n || 12);
    var weights = opts.weights;
    var items = slugs.map(function (slug, i) {
      // Recover a sci name from the slug - capitalize first segment.
      var parts = slug.split('-');
      var sci = parts.slice(0, 2).map(function (p, j) { return j === 0 ? p[0].toUpperCase() + p.slice(1) : p; }).join(' ');
      var n;
      if (weights === 'uniform') n = 10;
      else if (weights === 'extreme') n = i === 0 ? 500 : 1;
      else if (Array.isArray(weights)) n = weights[i] || 1;
      else n = Math.pow(0.55, i) * 100; // default hierarchy
      return { sci: sci, com: sci, n: n };
    });
    renderCollage(items);
    return { rendered: items.length, mode: weights || 'hierarchy' };
  };

  // Collage renders whatever is in DATA.recent.species. When the picker
  // changes, refreshRecent() refetches and re-renders. Empty state shows
  // a "no observations in this window" message.
  function renderCollageFromData(animate) {
    var items = (DATA.recent && DATA.recent.species) || [];
    renderCollage(items, animate);
  }
  var rTimer;
  window.addEventListener('resize', function () {
    clearTimeout(rTimer);
    rTimer = setTimeout(function () {
      renderCollageFromData();
      drawHistograms();
    }, 120);
  });

  // ---- Stats / Atlas data ----
  function setRow(id, label, val) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<span>' + label + '</span><span>' + (val == null || val === '' ? '-' : val) + '</span>';
  }
  function liRow(yr, label, ct, sci) {
    var attr = sci ? ' data-sci="' + sci.replace(/"/g, '&quot;') + '"' : '';
    return '<li' + attr + '><span class="yr">' + yr + '</span><span>' + label + '</span><span class="ct">' + (ct == null ? '-' : ct) + '</span></li>';
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtN(n) {
    if (n == null) return '-';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
  }
  // Compact count for atlas cards (1K, 1.2K); the modal keeps the exact number.
  function fmtNK(n) {
    if (n == null) return '-';
    return n < 1000 ? n.toLocaleString() : +(n / 1000).toFixed(1) + 'K';
  }
  // Human label for the current time-window picker selection - replaces
  // a bare "window" with the span it actually covers. Thresholds match
  // the winPick buttons (24H / 7D / 14D / 30D).
  function windowLabel(h) {
    if (h <= 24) return 'today';
    if (h <= 168) return 'this week';
    if (h <= 336) return 'past 14d';
    return 'past 30d';
  }

  // ---- eBird query prefs (menu drawer) ----
  // Persisted in localStorage; sent as query params on every birdnet-api call.
  var GEO_DEFAULTS = { lat: 40.794618, lng: -73.959878, dist: 3, mode: 'geo', hotspots: [], refreshMs: 5 * 60 * 1000 };
  var REFRESH_OPTS = [
    { label: '1m', ms: 60 * 1000 },
    { label: '5m', ms: 5 * 60 * 1000 },
    { label: '15m', ms: 15 * 60 * 1000 },
    { label: '1h', ms: 60 * 60 * 1000 },
    { label: '1d', ms: 24 * 60 * 60 * 1000 },
  ];
  function loadGeo() {
    var dist = parseInt(readLS('bird:dist', String(GEO_DEFAULTS.dist)), 10);
    var refreshMs = parseInt(readLS('bird:refreshMs', String(GEO_DEFAULTS.refreshMs)), 10);
    if (!REFRESH_OPTS.some(function (o) { return o.ms === refreshMs; })) {
      refreshMs = GEO_DEFAULTS.refreshMs;
    }
    var mode = readLS('bird:sourceMode', GEO_DEFAULTS.mode);
    var savedHotspots = [];
    try { savedHotspots = JSON.parse(readLS('bird:hotspots', '[]')); } catch (e) {}
    if (!Array.isArray(savedHotspots) || !savedHotspots.length) {
      var oldCode = readLS('bird:regionCode', '');
      if (oldCode) savedHotspots = [{ locId: oldCode, locName: readLS('bird:regionName', oldCode) }];
    }
    savedHotspots = savedHotspots.filter(function (h) { return h && /^[A-Za-z0-9-]+$/.test(String(h.locId || '')); })
      .filter(function (h, i, a) { return a.findIndex(function (x) { return x.locId === h.locId; }) === i; })
      .slice(0, 5);
    return {
      lat: parseFloat(readLS('bird:lat', String(GEO_DEFAULTS.lat))) || GEO_DEFAULTS.lat,
      lng: parseFloat(readLS('bird:lng', String(GEO_DEFAULTS.lng))) || GEO_DEFAULTS.lng,
      dist: Math.max(1, Math.min(50, isNaN(dist) ? GEO_DEFAULTS.dist : dist)),
      mode: mode === 'hotspot' ? 'hotspot' : 'geo',
      hotspots: savedHotspots,
      refreshMs: refreshMs,
    };
  }
  function saveGeo() {
    writeLS('bird:lat', String(GEO.lat));
    writeLS('bird:lng', String(GEO.lng));
    writeLS('bird:dist', String(GEO.dist));
    writeLS('bird:sourceMode', GEO.mode);
    writeLS('bird:hotspots', JSON.stringify(GEO.hotspots || []));
    writeLS('bird:refreshMs', String(GEO.refreshMs));
  }
  var GEO = loadGeo();
  function updateLocationSubtitle() {
    if (!staticLocation) return;
    var location = GEO.mode === 'hotspot'
      ? (GEO.hotspots.length === 1 ? (GEO.hotspots[0].locName || GEO.hotspots[0].locId) : GEO.hotspots.length + ' hotspots')
      : GEO.lat.toFixed(2) + ', ' + GEO.lng.toFixed(2);
    staticLocation.textContent = 'near ' + location;
  }
  updateLocationSubtitle();
  var forceRefreshOnce = false;

  function birdApi(qs) {
    var url = apiUrl('/avian/api/birdnet-api.php?') + qs
      + '&lat=' + encodeURIComponent(GEO.lat)
      + '&lng=' + encodeURIComponent(GEO.lng)
      + '&dist=' + encodeURIComponent(GEO.dist)
      + '&mode=' + encodeURIComponent(GEO.mode);
    if (GEO.mode === 'hotspot') {
      (GEO.hotspots || []).forEach(function (h) {
        url += '&regionCode[]=' + encodeURIComponent(h.locId);
      });
    }
    if (forceRefreshOnce) url += '&refresh=1';
    return url;
  }

  // ---- Live Pi data layer ----
  // All views read from this DATA object. Populated by fetchAll() on page
  // load and by refreshRecent() when the window picker changes.
  var STATS_DAYS = 30;
  var DATA = {
    timeseries: null,   // birdApi('action=timeseries&days=30')
    recent: null,       // birdApi('action=recent&hours=N')
  };

  // Derived chart arrays, backfilled so 30 buckets always exist.
  var STATS = {
    obsPerDay: new Array(STATS_DAYS).fill(0), // [day] total observations
    specPerDay: new Array(STATS_DAYS).fill(0), // [day] unique species
    byHour: new Array(24).fill(0),         // [hour-of-day] observations
  };

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
  }

  function backfillDaily(daily, days) {
    // Build a continuous array of (days) length, ending today.
    var byDate = {};
    (daily || []).forEach(function (row) { byDate[row.date] = row; });
    var out = new Array(days).fill(null).map(function () { return { observations: 0, species: 0 }; });
    var today = new Date();
    for (var i = 0; i < days; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() - (days - 1 - i));
      var key = d.toISOString().slice(0, 10);
      if (byDate[key]) {
        out[i].observations = +byDate[key].observations || 0;
        out[i].species = +byDate[key].species || 0;
      }
    }
    return out;
  }

  function recomputeDerived() {
    var ts = DATA.timeseries || { daily: [], by_hour: [] };
    var rows = backfillDaily(ts.daily, STATS_DAYS);
    STATS.obsPerDay = rows.map(function (r) { return r.observations; });
    STATS.specPerDay = rows.map(function (r) { return r.species; });
    var byHour = new Array(24).fill(0);
    (ts.by_hour || []).forEach(function (r) { byHour[+r.hour] = +r.observations; });
    STATS.byHour = byHour;
  }

  // Editorial detection timeline. One evenly-spaced column per species,
  // ordered oldest -> newest by last detection (x = time). Each species
  // owns a cell, so the black squares never overlap and a square fills
  // its column width - neighbours touch at the shared gridline. The
  // square's height up the column encodes detection count; a small
  // rotated label (common + scientific name) sits at the column's
  // bottom, and each column carries its own timestamp on the x-axis.
  function drawHistograms(animate) {
    var tl = document.getElementById('statsTimeline');
    if (!tl) return;
    var all = ((DATA.recent && DATA.recent.species) || []).slice();
    if (!all.length) {
      tl.innerHTML = '<div class="stats-tl-empty">no observations in this window</div>'
        + '<div class="stats-tl-footer"><div class="stats-tl-footer-title"><strong>Species observed</strong>'
        + '<button type="button" class="stats-help" data-stats-help="graph" aria-label="How the graph works">?</button></div>'
        + '<small>no observations in this window</small></div>';
      return;
    }

    // Discrete columns. On a phone the columns are fixed-width and wider
    // (legible squares + labels for touch) and the plot grows past the
    // viewport to scroll horizontally - so we show ALL species rather than
    // trimming. On desktop, cap to whatever fits the available width.
    var isMobile = (window.innerWidth || 800) <= 700;
    var containerW = Math.max(140, (tl.clientWidth || window.innerWidth || 800) - 34);
    var MIN_COL = isMobile ? 52 : 22;
    var cap = isMobile ? all.length : Math.max(3, Math.floor(containerW / MIN_COL));
    var trimmed = all.length > cap;
    var species = all.slice();
    if (trimmed) {
      species.sort(function (a, b) { return (+b.n || 0) - (+a.n || 0); });
      species = species.slice(0, cap);
    }
    // X-axis is time: order the chosen columns oldest -> newest.
    function parseTs(s) { return s ? Date.parse(s.replace(' ', 'T')) : NaN; }
    species.sort(function (a, b) {
      var ta = parseTs(a.last_observed), tb = parseTs(b.last_observed);
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return ta - tb;
    });

    var C = species.length;
    var maxN = species.reduce(function (m, s) { return Math.max(m, +s.n || 0); }, 1);
    // Mobile: fixed wide columns -> plot can exceed the viewport and scroll.
    // Desktop: columns split the available width evenly.
    var colW = isMobile ? MIN_COL : (containerW / C);
    var plotW = isMobile ? Math.max(containerW, C * colW) : containerW;
    // Square fills its column so adjacent squares touch at the shared
    // gridline; capped so a few species don't render as giant blocks.
    var sq = Math.max(6, Math.min(colW, isMobile ? 60 : 48));
    var LABEL_GAP = 6;       // px between a square's top and its label
    var SPAN = 0.55;         // squares occupy the bottom this fraction of
    // the plot by count (y = quantity); the
    // rotated label floats just above each square.

    // Y-axis quantity ticks: 0..maxN, with maxN pinned on the top tick.
    var ticks = [];
    if (maxN <= 8) {
      for (var v = 0; v <= maxN; v++) ticks.push(v);
    } else {
      var divs = 4;
      for (var di = 0; di <= divs; di++) ticks.push(Math.round(maxN * di / divs));
      ticks[ticks.length - 1] = maxN;
    }
    var yaxis = ticks.map(function (v) {
      return '<span class="stats-tl-ytick" style="bottom:' + ((v / maxN) * SPAN * 100).toFixed(1) + '%">' + v + '</span>';
    }).join('');

    // One timestamp under each column - format follows the window length.
    function fmtTs(ms) {
      if (isNaN(ms)) return '';
      var d = new Date(ms);
      var p2 = function (n) { return n < 10 ? '0' + n : '' + n; };
      if (currentHours <= 36) return p2(d.getHours()) + ':' + p2(d.getMinutes());
      if (currentHours <= 75 * 24) return (d.getMonth() + 1) + '/' + d.getDate();
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    // Faint gridlines at every column boundary. Start at gi=1: the gi=0
    // line would sit on top of the y-axis rule (double line), so skip it.
    var gridlines = '';
    for (var gi = 1; gi <= C; gi++) {
      gridlines += '<i class="stats-tl-gridline" style="left:' + (gi / C * 100).toFixed(3) + '%"></i>';
    }

    var cols = '', xaxis = '';
    species.forEach(function (s, i) {
      var centerPct = (i + 0.5) / C * 100;
      var n = +s.n || 0;
      var bottomPct = (n / maxN) * SPAN * 100;   // square height = quantity
      cols += ''
        + '<div class="stats-tl-col" data-sci="' + s.sci + '" style="left:' + centerPct.toFixed(3) + '%;width:' + colW.toFixed(2) + 'px">'
        + '<div class="stats-tl-square" style="bottom:' + bottomPct.toFixed(1) + '%;width:' + sq.toFixed(1) + 'px;height:' + sq.toFixed(1) + 'px"></div>'
        + '<div class="stats-tl-label" style="bottom:calc(' + bottomPct.toFixed(1) + '% + ' + (sq + LABEL_GAP) + 'px)"><span class="com">' + (s.com || s.sci) + '</span><span class="sci">' + s.sci + '</span></div>'
        + '</div>';
      var lab = fmtTs(parseTs(s.last_observed));
      if (lab) xaxis += '<span class="stats-tl-xtick" style="left:' + centerPct.toFixed(3) + '%">' + lab + '</span>';
    });

    var note = trimmed ? C + ' most observed of ' + all.length : 'all species in this window';
    tl.innerHTML =
      '<div class="stats-tl-yaxis">' + yaxis + '</div>'
      + '<div class="stats-tl-plot"' + (isMobile ? ' style="width:' + Math.round(plotW) + 'px"' : '') + '>'
      + gridlines + cols + xaxis
      + '</div>'
      + '<div class="stats-tl-footer"><div class="stats-tl-footer-title"><strong>Species observed</strong>'
      + '<button type="button" class="stats-help" data-stats-help="graph" aria-label="How the graph works">?</button></div>'
      + '<small>' + note + '</small></div>';
    if (animate) playStatsEntrance();
  }

  // Cross-highlight between the timeline squares and the right-side
  // species lists. Delegated off the stats view so it survives the
  // periodic re-render of both halves.
  (function wireStatsHighlight() {
    var v1 = document.getElementById('v1');
    if (!v1) return;
    function setHi(sci, on) {
      if (!sci) return;
      var esc = sci.replace(/"/g, '\"');
      v1.querySelectorAll('.stats-tl-col[data-sci="' + esc + '"], .stats-side li[data-sci="' + esc + '"]')
        .forEach(function (el) { el.classList.toggle('sync-hi', on); });
    }
    v1.addEventListener('mouseover', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-sci]');
      if (el) setHi(el.getAttribute('data-sci'), true);
    });
    v1.addEventListener('mouseout', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-sci]');
      if (el) {
        // Only clear if we're actually leaving the element (not moving
        // to a child).
        var to = ev.relatedTarget;
        if (to && el.contains(to)) return;
        setHi(el.getAttribute('data-sci'), false);
      }
    });
  })();

  // ---- Side text lists (real Pi data) ----
  function renderStatsLists() {
    var recent = DATA.recent || { species: [] };

    // Top Species - top 5 species in the current window. ./avian/api/birdnet-api.php?action=recent
    // already returns species sorted by last_observed DESC; re-sort by count.
    var ranked = (recent.species || [])
      .slice()
      .sort(function (a, b) { return (+b.n) - (+a.n); })
      .slice(0, 5);
    document.getElementById('statsTopSpec').innerHTML = ranked.length
      ? ranked.map(function (s, i) { return liRow(pad(i + 1), s.com, fmtN(+s.n), s.sci); }).join('')
      : liRow('-', 'no observations in window', '');
    document.getElementById('statsTopSpecCap').textContent =
      'most-observed, ' + windowLabel(currentHours);

  }

  // ---- Atlas: field-guide card grid ----
  function wikiUrl(sci) {
    return 'https://en.wikipedia.org/wiki/' + encodeURIComponent(sci.replace(/ /g, '_'));
  }
  function ebirdUrl(sci, speciesCode) {
    if (!speciesCode) {
      var species = ((DATA.recent && DATA.recent.species) || [])
        .find(function (s) { return s.sci === sci; });
      speciesCode = species && species.speciesCode;
    }
    var code = speciesCode;
    return code ? 'https://ebird.org/species/' + code : 'https://ebird.org/explore';
  }

  // Keep a missing cutout intentional and species-agnostic. The card still
  // carries the bird's identity below; this only fills the artwork slot.
  function createMissingArtwork() {
    var fallback = document.createElement('div');
    fallback.className = 'missing-artwork';
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', 'No artwork... yet');
    fallback.innerHTML = '<svg viewBox="0 0 120 148" aria-hidden="true" focusable="false">' +
      '<path class="feather-wash" d="M25 128C37 102 51 75 67 51 79 33 92 19 105 10 101 31 95 49 84 66 70 87 49 108 25 128Z" />' +
      '<path class="feather-edge feather-edge-top" d="M105 10C95 11 85 15 76 22M71 25C58 33 47 42 39 53" />' +
      '<path class="feather-edge" d="M105 10C93 18 82 30 71 46M68 51C57 66 45 83 34 99M32 105C28 114 26 122 25 128" />' +
      '<path class="feather-edge feather-edge-right" d="M105 10C103 28 98 46 88 63M85 68C73 87 55 106 25 128" />' +
      '<path class="feather-shaft" d="M10 145C35 102 52 74 67 51 80 31 93 18 105 10" />' +
      '<path class="feather-barb" d="M96 18C84 20 75 23 66 28M89 29C77 32 67 36 57 41M82 40C69 44 58 49 48 55M75 52C62 57 51 63 40 70M68 65C55 70 44 77 34 85M60 79C48 85 38 92 29 101M51 94C42 99 34 106 26 114" />' +
      '<path class="feather-barb feather-barb-light" d="M101 23C98 34 94 44 89 53M94 39C88 52 81 62 73 72M87 55C79 69 70 80 60 91M78 73C68 87 57 98 46 109M67 92C57 105 47 115 37 123" />' +
      '<path class="feather-tip" d="M10 145 25 128 31 137" />' +
      '</svg><span>No artwork... yet</span>';
    return fallback;
  }
  function atlasArtworkFallback(img) {
    if (!img || !img.parentNode || img.dataset.fallback) return;
    img.dataset.fallback = 'true';
    var fallback = createMissingArtwork();
    img.parentNode.replaceChild(fallback, img);
  }
  function modalArtworkFallback(img) {
    var holder = img && img.parentNode;
    if (!holder || holder.querySelector('.missing-artwork')) return;
    img.style.display = 'none';
    holder.appendChild(createMissingArtwork());
  }
  function clearModalArtworkFallback(img) {
    var holder = img && img.parentNode;
    if (!holder) return;
    var fallback = holder.querySelector('.missing-artwork');
    if (fallback) fallback.remove();
    img.style.display = '';
  }

  // Tiny inline icons - monochrome, ink-only, match the page palette.
  function renderAtlas(animate) {
    var grid = document.getElementById('atlasGrid');
    if (!grid) return;

    var recent = (DATA.recent && DATA.recent.species) || [];

    if (!recent.length) {
      grid.innerHTML = '<div class="atlas-empty">' +
        '<p>No birds observed yet.</p>' +
        '<p class="hint">The atlas fills up as new species are observed.</p>' +
        '</div>';
      return;
    }

    // Sort by the atlas-sort segmented control (defaults to "count" =
    // most-observed in the selected window).
    var sortMode = (window.__atlasSort) || 'count';
    var species = recent.slice();
    if (sortMode === 'count') {
      species.sort(function (a, b) {
        return (+b.n || 0) - (+a.n || 0);
      });
    } else if (sortMode === 'recent') {
      species.sort(function (a, b) {
        return (b.last_observed || '').localeCompare(a.last_observed || '');
      });
    } else if (sortMode === 'alpha') {
      species.sort(function (a, b) {
        return (a.com || a.sci || '').localeCompare(b.com || b.sci || '');
      });
    }

    grid.innerHTML = species.map(function (s) {
      var sketchSrc = apiUrl('/avian/api/cutout.php?sci=') + encodeURIComponent(s.sci) +
        (s.com ? '&com=' + encodeURIComponent(s.com) : '') +
        '&v=' + SKETCH_VERSION;
      // Show only the count for the selected, bounded observation window.
      var statRows = '<div><span class="n">' + fmtNK(+s.n || 0) + '</span><span class="lbl-inline">' + windowLabel(currentHours) + '</span></div>';
      return ''
        + '<article class="bird-card" data-sci="' + s.sci + '">'
        + '<div class="stat">' + statRows + '</div>'
        + '<div class="img-wrap">'
        + '<img loading="lazy" decoding="async" src="' + sketchSrc + '" alt="' + s.com + '">'
        + '</div>'
        + '<h3>' + s.com + '</h3>'
        + '<div class="sci">' + s.sci + '</div>'
        + '<div class="actions">'
        + '<a class="chip ext" href="' + wikiUrl(s.sci) + '" target="_blank" rel="noopener" aria-label="Wikipedia">wiki</a>'
        + '<a class="chip ext" href="' + ebirdUrl(s.sci, s.speciesCode) + '" target="_blank" rel="noopener" aria-label="eBird">ebird</a>'
        + '</div>'
        + '</article>';
    }).join('');

    grid.querySelectorAll('.bird-card .img-wrap img').forEach(function (img) {
      img.addEventListener('error', function () { atlasArtworkFallback(img); }, { once: true });
    });

    if (animate) playAtlasEntrance();
  }

  function renderWindowDependent(animate) {
    // renderStatsLists runs BEFORE drawHistograms so the stats entrance
    // (fired at the end of drawHistograms) can stagger the side-panel rows
    // that were just built, in tandem with the graph populating.
    renderCollageFromData(animate);
    renderStatsLists();
    drawHistograms(animate);
    renderAtlas(animate);
  }
  function renderTimeIndependent(animate) {
    // Lists first, then the graph (see renderWindowDependent).
    renderStatsLists();
    drawHistograms(animate);
    renderAtlas(animate);
  }

  function refreshRecent(animate) {
    // Capture the window this fetch was issued for. If the user
    // changes the picker again before it resolves - or a slower poll
    // lands later - we discard the stale response so the collage
    // never reverts to a different window.
    var forHours = currentHours;
    return fetchJson(birdApi('action=recent&hours=' + forHours))
      .then(function (j) {
        if (forHours !== currentHours) return; // window changed mid-flight
        DATA.recent = j; renderWindowDependent(animate);
      })
      .catch(function (e) { console.warn('recent fetch failed', e); });
  }
  function refreshAll(animate, force) {
    var forHours = currentHours;
    if (force) forceRefreshOnce = true;
    return Promise.all([
      fetchJson(birdApi('action=timeseries&days=30')).catch(function () { return null; }),
      fetchJson(birdApi('action=recent&hours=' + forHours)).catch(function () { return null; }),
    ]).then(function (parts) {
      forceRefreshOnce = false;
      DATA.timeseries = parts[0];
      // Only accept the recent slice if the window hasn't changed
      // since this poll started - otherwise keep what's there.
      if (forHours === currentHours && parts[1]) DATA.recent = parts[1];
      recomputeDerived();
      renderTimeIndependent(animate);
      renderCollageFromData(animate);
    }).finally(function () { forceRefreshOnce = false; });
  }

  // Kick off the initial fetch. Renders pull from DATA as soon as it
  // populates; until then the page sits with empty histograms + lists.
  // animate=true so the collage blooms in on first load.
  refreshAll(true);

  // Hook into the window picker so the data refetches on change. Pass
  // animate=true so the collage blooms (the silent poll passes nothing).
  winBtns.forEach(function (b) {
    b.addEventListener('click', function () { refreshRecent(true); });
  });

  // ---- Realtime polling ----
  // Interval comes from the menu refresh selector (1m / 5m / 15m / 1h / 1d).
  // Polling pauses when the tab is hidden and resumes (with an immediate
  // fetch) when it becomes visible again.
  var pollTimer = null;
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      refreshAll();
    }, GEO.refreshMs);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
    } else {
      refreshAll();
      startPolling();
    }
  });
  startPolling();

  // ---- Menu dropdown ----
  var locationDd = document.getElementById('location-dd');
  var refreshDd = document.getElementById('refresh-dd');
  var infoDd = document.getElementById('info-dd');
  var locationBtn = document.getElementById('locationBtn');
  var refreshMenuBtn = document.getElementById('refreshBtn');
  var infoBtn = document.getElementById('infoBtn');
  var locationLocked = document.getElementById('location-locked');
  var refreshLocked = document.getElementById('refresh-locked');
  var locationItems = document.getElementById('location-items');
  var refreshItems = document.getElementById('refresh-items');
  var lockHint = document.getElementById('lockHint');
  var menuEntries = [
    { button: locationBtn, panel: locationDd },
    { button: refreshMenuBtn, panel: refreshDd },
    { button: infoBtn, panel: infoDd }
  ];
  function closeDd(panel) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    var entry = menuEntries.find(function (item) { return item.panel === panel; });
    if (entry) entry.button.setAttribute('aria-expanded', 'false');
  }
  function openDd(panel) {
    if (panel === refreshDd && locationLocked.style.display !== 'none') {
      openDd(locationDd);
      return;
    }
    menuEntries.forEach(function (item) {
      if (item.panel !== panel) closeDd(item.panel);
    });
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    var entry = menuEntries.find(function (item) { return item.panel === panel; });
    if (entry) entry.button.setAttribute('aria-expanded', 'true');
    if (panel === locationDd && locationLocked.style.display !== 'none') {
      setTimeout(function () {
        var pass = document.getElementById('lockPass');
        if (pass) pass.focus();
      }, 100);
    }
  }
  function toggleDd(panel) { panel.classList.contains('open') ? closeDd(panel) : openDd(panel); }
  menuEntries.forEach(function (entry) {
    entry.button.addEventListener('click', function (e) { e.stopPropagation(); toggleDd(entry.panel); });
  });
  staticLocation.addEventListener('click', function (e) { e.stopPropagation(); openDd(locationDd); });
  document.addEventListener('click', function (e) {
    if (!menuEntries.some(function (item) { return item.panel.contains(e.target) || item.button === e.target; })) {
      menuEntries.forEach(function (item) { closeDd(item.panel); });
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') menuEntries.forEach(function (item) { closeDd(item.panel); });
  });

  // Probe menu.php with no Authorization header. On a LAN deploy
  // (AV_REQUIRE_AUTH=0) it returns 200 immediately so the drawer
  // renders directly. On a forwarded deploy with Caddy basic_auth in
  // front, Caddy will already have validated credentials before this
  // request reaches PHP - so a 200 here means we're authed, a 401
  // means Caddy rejected and we need the lock-screen flow.
  function tryAutoUnlock() {
    fetch(apiUrl('/avian/api/menu.php'), { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 200) {
        return r.json().then(function (j) { renderMenu(j.items || []); });
      }
    }).catch(function () { });
  }
  tryAutoUnlock();

  document.getElementById('unlockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    // BirdNET-Pi's upstream Caddyfile basicauth user is `birdnet`.
    // If your install changed it (custom Caddyfile), set window.AV_AUTH_USER
    // before this script loads - e.g. an inline <script> in index.html.
    var u = (window.AV_AUTH_USER || 'birdnet');
    var p = document.getElementById('lockPass').value;
    var hdr = 'Basic ' + btoa(u + ':' + p);
    // POST to menu.php with the header so the browser caches the basic
    // creds for every subsequent request. If Caddy basic_auth accepts
    // them we get a 200 and the drawer renders; 401 means wrong password.
    fetch(apiUrl('/avian/api/menu.php'), {
      method: 'POST',
      headers: { 'Authorization': hdr },
      credentials: 'same-origin',
    }).then(function (r) {
      if (r.status === 200) {
        return r.json().then(function (j) { renderMenu(j.items || []); });
      } else if (r.status === 401) {
        lockHint.textContent = 'wrong password.';
        lockHint.classList.add('lock-err');
      } else {
        lockHint.textContent = 'auth unavailable.';
        lockHint.classList.add('lock-err');
      }
    }).catch(function () {
      lockHint.textContent = 'network error.';
      lockHint.classList.add('lock-err');
    });
  });

  // Render the unlocked drawer: eBird location + poll controls.
  function renderMenu(menu) {
    locationLocked.style.display = 'none';
    refreshLocked.style.display = 'none';
    locationItems.classList.add('show');
    refreshItems.classList.add('show');
    var geoEsc = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var linksHtml = (menu || []).map(function (it) {
      var label = (it.label || '');
      var attrs = it.native ? '' : ' target="_blank" rel="noopener"';
      var cls = it.native ? '' : ' class="ext"';
      return '<a' + cls + ' href="' + it.href + '"' + attrs + '><span>' + label + '</span></a>';
    }).join('');

    var refreshBtns = REFRESH_OPTS.map(function (o) {
      var cur = o.ms === GEO.refreshMs ? 'true' : 'false';
      return '<button type="button" data-ms="' + o.ms + '" aria-current="' + cur + '">' + o.label + '</button>';
    }).join('');
    var sourceBtns = [
      ['geo', 'distance'],
      ['hotspot', 'hotspot'],
    ].map(function (source) {
      return '<button type="button" data-source="' + source[0] + '" aria-current="'
        + (GEO.mode === source[0] ? 'true' : 'false') + '">' + source[1] + '</button>';
    }).join('');
    var hotspotControls = GEO.mode === 'hotspot'
      ? '    <div class="menu-row hotspot-row">'
        + '      <div class="label-block"><span class="label">Hotspot</span>'
        + '        <span class="hint">choose up to five locations in this search area</span>'
        + '        <button type="button" id="findHotspots">find hotspots</button></div>'
        + '      <div class="hotspot-picker" id="hotspotPicker">'
        + '        <div class="hotspot-chips" id="hotspotChips"></div>'
        + '        <input id="hotspotSearch" type="search" autocomplete="off" placeholder="search hotspots…" aria-label="Search hotspots" aria-controls="hotspotResults" aria-expanded="false">'
        + '        <div class="hotspot-count" id="hotspotCount">0 of 5 selected</div>'
        + '        <div class="hotspot-results" id="hotspotResults" role="listbox" aria-label="Hotspot results"></div>'
        + '      </div>'
        + '    </div>'
      : '';

    locationItems.innerHTML =
      '<div class="menu-geo" id="menuGeo">'
      + '  <div class="menu-section">'
      + '    <div class="section-header menu-section-head"><h3>Location</h3>'
      + '      <button type="button" class="stats-help" id="locationHelp" aria-label="Distance versus hotspot">?</button></div>'
      + '    <div class="menu-row source-row">'
      + '      <div><span class="label">Bird source</span>'
      + '        <span class="hint">search by distance or by eBird hotspot</span></div>'
      + '      <div class="seg" id="geoSourceSeg" role="tablist"><i class="seg-pill" aria-hidden="true"></i>' + sourceBtns + '</div>'
      + '    </div>'
      + '    <div class="menu-row geo-coords">'
      + '      <label class="geo-field"><span class="label">Latitude</span>'
      + '        <input id="geoLat" type="number" step="any" inputmode="decimal" value="' + GEO.lat + '">'
      + '      </label>'
      + '      <label class="geo-field"><span class="label">Longitude</span>'
      + '        <input id="geoLng" type="number" step="any" inputmode="decimal" value="' + GEO.lng + '">'
      + '      </label>'
      + '    </div>'
      + '    <div class="slider-row">'
      + '      <div class="head">'
      + '        <div class="label-block"><span class="label">Distance</span>'
      + '          <span class="hint">search radius in km (1–50)</span></div>'
      + '        <span class="value" id="geoDistVal">' + GEO.dist + ' km</span>'
      + '      </div>'
      + '      <div class="slider-track">'
      + '        <input id="geoDist" type="range" min="1" max="50" step="1" value="' + GEO.dist + '">'
      + '      </div>'
      + '    </div>'
      + hotspotControls
      + '  </div>'
      + '</div>';
    refreshItems.innerHTML =
      '<div class="menu-geo" id="menuRefresh">'
      + '  <div class="menu-section">'
      + '    <h3>Refresh data</h3>'
      + '    <div class="menu-row">'
      + '      <div><span class="label">Auto refresh</span>'
      + '        <span class="hint">how often to pull eBird</span></div>'
      + '      <div class="seg" id="geoRefreshSeg" role="tablist">'
      + '        <i class="seg-pill" aria-hidden="true"></i>'
      + refreshBtns
      + '      </div>'
      + '    </div>'
      + '    <div class="menu-save-row">'
      + '      <span class="save-state" id="geoStatus"></span>'
      + '      <button type="button" id="geoRefreshBtn">refresh now</button>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + (linksHtml ? '<div class="menu-links">' + linksHtml + '</div>' : '')
      + '</div>';

    var menuLinks = refreshItems.querySelector('.menu-links');
    if (menuLinks) menuLinks.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) closeDd(refreshDd);
    });

    var latIn = document.getElementById('geoLat');
    var lngIn = document.getElementById('geoLng');
    var distIn = document.getElementById('geoDist');
    var distVal = document.getElementById('geoDistVal');
    var statusEl = document.getElementById('geoStatus');
    var refreshBtn = document.getElementById('geoRefreshBtn');
    var refreshSeg = document.getElementById('geoRefreshSeg');
    var sourceSeg = document.getElementById('geoSourceSeg');
    var hotspotSearch = document.getElementById('hotspotSearch');
    var hotspotResults = document.getElementById('hotspotResults');
    var hotspotChips = document.getElementById('hotspotChips');
    var hotspotCount = document.getElementById('hotspotCount');
    var findHotspotsBtn = document.getElementById('findHotspots');
    var locationHelpBtn = document.getElementById('locationHelp');
    var locationHelpModal = document.getElementById('location-help-modal');

    if (locationHelpBtn) locationHelpBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      locationHelpModal.setAttribute('aria-hidden', 'false');
    });

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || '';
    }
    function applyGeo(opts) {
      opts = opts || {};
      var lat = parseFloat(latIn.value);
      var lng = parseFloat(lngIn.value);
      var dist = parseInt(distIn.value, 10);
      if (isNaN(lat) || isNaN(lng)) {
        setStatus('invalid coordinates');
        return;
      }
      var nextDist = Math.max(1, Math.min(50, isNaN(dist) ? GEO.dist : dist));
      var locationChanged = GEO.lat !== lat || GEO.lng !== lng || GEO.dist !== nextDist;
      GEO.lat = lat;
      GEO.lng = lng;
      GEO.dist = nextDist;
      distIn.value = String(GEO.dist);
      distVal.textContent = GEO.dist + ' km';
      saveGeo();
      if (locationChanged) {
        GEO.hotspots = [];
        saveGeo();
        updateLocationSubtitle();
        if (GEO.mode === 'hotspot') {
          if (opts.hotspots !== false) loadHotspots();
          setStatus('select a hotspot');
          return true;
        }
      }
      updateLocationSubtitle();
      if (opts.refresh !== false) {
        setStatus('updating…');
        refreshAll(true, true).then(function () { setStatus('updated'); });
      }
      return true;
    }

    function renderHotspotPicker() {
      if (!hotspotResults) return;
      var q = (hotspotSearch ? hotspotSearch.value : '').trim().toLowerCase();
      var selected = GEO.hotspots || [];
      var selectedIds = selected.map(function (h) { return h.locId; });
      if (hotspotChips) hotspotChips.innerHTML = selected.map(function (h) {
        return '<span class="hotspot-chip">' + geoEsc(h.locName || h.locId)
          + '<button type="button" data-remove-hotspot="' + geoEsc(h.locId) + '" aria-label="Remove ' + geoEsc(h.locName || h.locId) + '">×</button></span>';
      }).join('');
      if (hotspotCount) hotspotCount.textContent = selected.length + ' of 5 selected';
      var filtered = (window._avianHotspots || []).filter(function (h) {
        var hay = String(h.locName || '') + ' ' + String(h.locId || '');
        return selectedIds.indexOf(String(h.locId || '')) === -1
          && (!q || hay.toLowerCase().indexOf(q) !== -1);
      });
      hotspotResults.innerHTML = filtered.length ? filtered.slice(0, 100).map(function (h) {
        var id = String(h.locId || '');
        var disabled = selected.length >= 5;
        return '<button type="button" role="option" aria-selected="false"'
          + (disabled ? ' disabled' : '') + ' data-hotspot-id="' + geoEsc(id) + '">'
          + geoEsc(h.locName || id) + '<small>' + geoEsc(id) + '</small></button>';
      }).join('') : '<span class="hotspot-empty">' + (window._avianHotspots ? 'no hotspots found' : 'loading hotspots…') + '</span>';
    }
    function loadHotspots(force) {
      if (!hotspotSearch) return;
      // Keep the sort anchored to the same coordinates sent to eBird, even
      // if the user edits a field while the hotspot request is in flight.
      var originLat = GEO.lat * Math.PI / 180;
      var originLng = GEO.lng * Math.PI / 180;
      function distanceFromOrigin(h) {
        var lat = parseFloat(h.lat), lng = parseFloat(h.lng);
        if (isNaN(lat) || isNaN(lng)) return Infinity;
        var dLat = lat * Math.PI / 180 - originLat;
        var dLng = lng * Math.PI / 180 - originLng;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(originLat) * Math.cos(lat * Math.PI / 180)
          * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      window._avianHotspots = null;
      renderHotspotPicker();
      if (findHotspotsBtn) findHotspotsBtn.disabled = true;
      var url = birdApi('action=hotspots') + (force ? '&refresh=1' : '');
      fetchJson(url).then(function (data) {
        var hotspots = ((data && data.hotspots) || []).slice().sort(function (a, b) {
          var byDistance = distanceFromOrigin(a) - distanceFromOrigin(b);
          return byDistance || String(a.locName || '').localeCompare(String(b.locName || ''));
        });
        window._avianHotspots = hotspots;
        var byId = {}; hotspots.forEach(function (h) { byId[h.locId] = h; });
        GEO.hotspots = (GEO.hotspots || []).map(function (h) { return byId[h.locId] ? { locId: h.locId, locName: byId[h.locId].locName || h.locName } : h; }).slice(0, 5);
        saveGeo(); updateLocationSubtitle(); renderHotspotPicker();
        if (!hotspots.length) setStatus('no hotspots found');
        else if (!GEO.hotspots.length) setStatus('select a hotspot');
      }).catch(function () {
        window._avianHotspots = [];
        renderHotspotPicker();
        setStatus('hotspot search failed');
      }).finally(function () {
        if (findHotspotsBtn) findHotspotsBtn.disabled = false;
      });
    }

    distIn.addEventListener('input', function () {
      distVal.textContent = distIn.value + ' km';
    });
    distIn.addEventListener('change', function () { applyGeo(); });
    latIn.addEventListener('change', function () { applyGeo(); });
    lngIn.addEventListener('change', function () { applyGeo(); });
    // Keep drawer open while editing.
    [latIn, lngIn, distIn].forEach(function (el) {
      el.addEventListener('click', function (ev) { ev.stopPropagation(); });
    });

    if (sourceSeg) {
      syncPill(sourceSeg);
      sourceSeg.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var btn = ev.target.closest('button[data-source]');
        if (!btn || btn.dataset.source === GEO.mode) return;
        GEO.mode = btn.dataset.source;
        saveGeo();
        updateLocationSubtitle();
        renderMenu(menu);
        if (GEO.mode === 'geo') refreshAll(true, true);
      });
    }
    if (hotspotSearch) {
      hotspotSearch.addEventListener('input', renderHotspotPicker);
      hotspotSearch.addEventListener('focus', function () { hotspotSearch.setAttribute('aria-expanded', 'true'); });
      hotspotSearch.addEventListener('click', function (ev) { ev.stopPropagation(); });
      hotspotSearch.addEventListener('keydown', function (ev) {
        var options = Array.prototype.slice.call(hotspotResults.querySelectorAll('[data-hotspot-id]:not(:disabled)'));
        if (!options.length) return;
        var active = document.activeElement, index = options.indexOf(active);
        if (ev.key === 'ArrowDown') { ev.preventDefault(); options[Math.min(index + 1, options.length - 1)].focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (index <= 0) hotspotSearch.focus(); else options[index - 1].focus(); }
        else if (ev.key === 'Enter') { ev.preventDefault(); options[0].click(); }
      });
      function toggleHotspot(ev) {
        ev.stopPropagation();
        var removeEl = ev.target.closest('[data-remove-hotspot]');
        var resultEl = ev.target.closest('[data-hotspot-id]');
        var id = removeEl ? removeEl.getAttribute('data-remove-hotspot') : (resultEl ? resultEl.getAttribute('data-hotspot-id') : '');
        if (!id) return;
        var existing = (GEO.hotspots || []).findIndex(function (h) { return h.locId === id; });
        if (existing >= 0) GEO.hotspots.splice(existing, 1);
        else {
          var h = (window._avianHotspots || []).find(function (x) { return x.locId === id; });
          if (h && GEO.hotspots.length < 5) GEO.hotspots.push({ locId: h.locId, locName: h.locName || h.locId });
        }
        saveGeo();
        updateLocationSubtitle();
        renderHotspotPicker();
        if (!GEO.hotspots.length) { setStatus('select a hotspot'); return; }
        setStatus('updating…');
        refreshAll(true, true).then(function () { setStatus('updated'); });
      }
      hotspotResults.addEventListener('click', toggleHotspot);
      hotspotChips.addEventListener('click', toggleHotspot);
      loadHotspots();
    }
    if (findHotspotsBtn) {
      findHotspotsBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (applyGeo({ refresh: false, hotspots: false })) loadHotspots(true);
      });
    }

    if (refreshSeg) {
      syncPill(refreshSeg);
      wireToggleAdvance(refreshSeg);
      refreshSeg.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var btn = ev.target.closest('button[data-ms]');
        if (!btn) return;
        GEO.refreshMs = +btn.getAttribute('data-ms');
        refreshSeg.querySelectorAll('button').forEach(function (b) {
          b.setAttribute('aria-current', b === btn ? 'true' : 'false');
        });
        syncPill(refreshSeg);
        saveGeo();
        startPolling();
        setStatus('auto refresh set');
      });
    }

    refreshBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      applyGeo({ refresh: false });
      setStatus('refreshing…');
      refreshBtn.disabled = true;
      refreshAll(true, true).then(function () {
        setStatus('updated');
        refreshBtn.disabled = false;
      }).catch(function () {
        setStatus('refresh failed');
        refreshBtn.disabled = false;
      });
    });
  }

  // Pending changes (key -> value), saved on click of the Save button.
  var pending = {};

  function setSaveState(msg, cls) {
    var el = document.getElementById('saveState');
    if (el) { el.textContent = msg || ''; el.className = 'save-state' + (cls ? ' ' + cls : ''); }
    var btn = document.getElementById('saveBtn');
    if (btn) btn.disabled = Object.keys(pending).length === 0;
  }

  function loadSettings() {
    fetch(apiUrl('/avian/api/config.php'), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (cfg) {
        var v = cfg.values || {};
        var preserve = cfg.preserve;
        var html = ''
          + settingsToggle('preserve', 'Preserve all recordings', "don't auto-delete", preserve)
          + settingsSlider('CONFIDENCE', 'Confidence threshold', 'min score to log a detection', v.CONFIDENCE, 0.1, 0.95, 0.05, 2)
          + settingsSlider('SENSITIVITY', 'Sensitivity', 'analyzer sensitivity', v.SENSITIVITY, 0.5, 1.5, 0.05, 2)
          + settingsSlider('OVERLAP', 'Chunk overlap', 'seconds analyzed per pass', v.OVERLAP, 0, 2.5, 0.1, 1)
          + settingsSegmented('FULL_DISK', 'When disk fills', '', v.FULL_DISK, [
            { v: 'keep', label: 'keep' },
            { v: 'purge', label: 'purge' },
          ])
          + '<div class="menu-save-row">'
          + '  <span class="save-state" id="saveState"></span>'
          + '  <button type="button" id="saveBtn" disabled>save</button>'
          + '</div>';
        var body = document.getElementById('settingsBody');
        if (body) body.innerHTML = html;
        wireSettingsControls();
        var saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveSettings);
      })
      .catch(function (err) {
        var body = document.getElementById('settingsBody');
        if (body) body.innerHTML =
          '<div class="menu-row"><span class="label">Failed to load <small class="hint">' + err + '</small></span></div>';
      });
  }

  function settingsToggle(key, label, hint, on) {
    return ''
      + '<div class="menu-row">'
      + '  <div><span class="label">' + label + '</span>'
      + (hint ? '<span class="hint">' + hint + '</span>' : '')
      + '  </div>'
      + '  <button type="button" class="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-key="' + key + '"></button>'
      + '</div>';
  }
  function settingsSlider(key, label, hint, val, min, max, step, digits) {
    return ''
      + '<div class="slider-row">'
      + '  <div class="head">'
      + '    <div class="label-block">'
      + '      <span class="label">' + label + '</span>'
      + (hint ? '<span class="hint">' + hint + '</span>' : '')
      + '    </div>'
      + '    <span class="value" data-value-for="' + key + '">' + (+val).toFixed(digits) + '</span>'
      + '  </div>'
      + '  <div class="slider-track">'
      + '    <input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" data-key="' + key + '" data-digits="' + digits + '">'
      + '  </div>'
      + '</div>';
  }
  function settingsSegmented(key, label, hint, val, opts) {
    var btns = opts.map(function (o) {
      return '<button type="button" data-v="' + o.v + '" aria-current="' + (o.v === val ? 'true' : 'false') + '">' + o.label + '</button>';
    }).join('');
    return ''
      + '<div class="menu-row">'
      + '  <div><span class="label">' + label + '</span>'
      + (hint ? '<span class="hint">' + hint + '</span>' : '')
      + '  </div>'
      + '  <div class="seg" data-key="' + key + '">' + btns + '</div>'
      + '</div>';
  }
  // Client-side theme switcher row. Reuses the .seg look but is tagged
  // data-theme-seg so wireSettingsControls skips it - it applies instantly
  // and is NOT part of the Pi config save flow.
  function themeRow() {
    var cur = currentTheme();
    var btn = function (v, label) {
      return '<button type="button" data-theme="' + v + '" aria-current="' + (cur === v ? 'true' : 'false') + '">' + label + '</button>';
    };
    return ''
      + '<div class="menu-row">'
      + '  <div><span class="label">Theme</span><span class="hint">saved on this device</span></div>'
      + '  <div class="seg" data-theme-seg>' + btn('light', 'light') + btn('dark', 'dark') + '</div>'
      + '</div>';
  }
  function wireSettingsControls(scope) {
    scope = scope || document;
    scope.querySelectorAll('.switch').forEach(function (sw) {
      sw.addEventListener('click', function () {
        var on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        pending[sw.dataset.key] = on;
        setSaveState('change pending');
      });
    });
    scope.querySelectorAll('input[type="range"]').forEach(function (sl) {
      sl.addEventListener('input', function () {
        var v = +sl.value;
        var digits = +sl.dataset.digits || 2;
        var label = scope.querySelector('[data-value-for="' + sl.dataset.key + '"]');
        if (label) label.textContent = v.toFixed(digits);
        pending[sl.dataset.key] = v;
        setSaveState('change pending');
      });
    });
    scope.querySelectorAll('.seg:not([data-theme-seg])').forEach(function (seg) {
      seg.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
          pending[seg.dataset.key] = b.dataset.v;
          setSaveState('change pending');
        });
      });
    });
  }

  function saveSettings() {
    if (Object.keys(pending).length === 0) return;
    var body = JSON.stringify(pending);
    setSaveState('saving...');
    fetch(apiUrl('/avian/api/config.php'), {
      method: 'POST', body: body,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) {
          pending = {};
          setSaveState('saved ✓', 'ok');
          setTimeout(function () { setSaveState(''); }, 1800);
        } else {
          setSaveState('save failed', 'err');
        }
      })
      .catch(function () { setSaveState('network error', 'err'); });
  }

  // ---- Hash routing + atlas detail modal ----
  // When a collage tile or stats row is clicked it sets
  // location.hash = '#sci=<name>'. On arrival we switch to the atlas
  // view, highlight the matching card, AND open the detail modal with
  // expanded info (Wikipedia summary and taxonomy).
  function readHash() {
    var m = location.hash.match(/^#sci=([^&]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  }
  function highlightAtlas(sci) {
    var grid = document.getElementById('atlasGrid');
    if (!grid) return;
    grid.querySelectorAll('.bird-card[data-active="true"]').forEach(function (c) {
      c.removeAttribute('data-active');
    });
    if (!sci) return;
    var attempts = 0;
    (function find() {
      var card = grid.querySelector('.bird-card[data-sci="' + sci.replace(/"/g, '\"') + '"]');
      if (!card) {
        if (attempts++ < 10) return setTimeout(find, 80);
        return;
      }
      card.setAttribute('data-active', 'true');
      card.setAttribute('data-pulse', 'true');
      setTimeout(function () { card.removeAttribute('data-pulse'); }, 520);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    })();
  }

  // ---- Detail modal ----
  // Caches per-sci species info so opening the same modal twice doesn't
  // re-fetch. Wikipedia + per-species endpoints are slow over the
  // tunnel; one fetch per session is plenty.
  var SPECIES_CACHE = {};
  var WIKI_CACHE = {};
  function rarityLabel(total, firstSeenIso) {
    if (!total) return '-';
    var days = 1;
    if (firstSeenIso) {
      var t = Date.parse((firstSeenIso || '').replace(' ', 'T'));
      if (!isNaN(t)) days = Math.max(1, Math.ceil((Date.now() - t) / 86400000));
    }
    var perDay = total / days;
    if (perDay >= 5) return 'common';
    if (perDay >= 1) return 'regular';
    if (perDay >= 0.2) return 'occasional';
    return 'rare';
  }
  function relativeObservationTime(obsDt, now) {
    var timestamp = Date.parse((obsDt || '').replace(' ', 'T'));
    if (isNaN(timestamp)) return '-';
    var minutes = Math.max(0, Math.floor(((now || Date.now()) - timestamp) / 60000));
    if (minutes < 60) {
      return minutes + ' min ago';
    }
    var hours = Math.floor(minutes / 60);
    if (hours < 24) {
      var remainingMinutes = minutes % 60;
      var hourLabel = hours + ' hour' + (hours === 1 ? '' : 's');
      if (!remainingMinutes) return hourLabel + ' ago';
      return hourLabel + ' and ' + remainingMinutes + ' min ago';
    }
    var days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }
  function lastObservedParts(summary, now) {
    return {
      location: (summary && summary.last_locName) || '-',
      time: relativeObservationTime(summary && summary.last_observed, now),
    };
  }
  function sketchSrc(sci, pose) {
    // Look up the common name from the current window data so the worker's JIT
    // Gemini prompt is right for a never-pre-rendered species.
    var sp = ((DATA.recent && DATA.recent.species) || [])
      .find(function (s) { return s.sci === sci; });
    var com = sp ? (sp.com || '') : '';
    var base = apiUrl('/avian/api/cutout.php?sci=') + encodeURIComponent(sci) +
      (com ? '&com=' + encodeURIComponent(com) : '') +
      '&v=' + SKETCH_VERSION;
    var n = +pose || 1;
    return n > 1 ? base + '&pose=' + n : base;
  }
  function openDetailModal(sci) {
    if (!sci) return;
    var modal = document.getElementById('detail-modal');
    var img = document.getElementById('modalImg');
    var poseToggle = document.getElementById('modalPoseToggle');
    var poseBtns = [].slice.call(poseToggle.querySelectorAll('button'));

    // Reset the toggle: assume nothing's available, set pose 1 (perched
    // cutout - every species has it) as the optimistic default. HEAD
    // probes below toggle each button on/off and pick the best default.
    poseToggle.removeAttribute('data-unavailable');
    poseBtns.forEach(function (b) {
      b.setAttribute('data-unavailable', 'true');
      b.setAttribute('aria-current', 'false');
    });
    var p1 = poseToggle.querySelector('button[data-pose="1"]');
    if (p1) {
      p1.removeAttribute('data-unavailable');
      p1.setAttribute('aria-current', 'true');
    }
    clearModalArtworkFallback(img);
    img.onerror = function () { modalArtworkFallback(img); };
    img.onload = function () { clearModalArtworkFallback(img); };
    img.src = sketchSrc(sci, 1);
    img.alt = sci;

    // Probe each pose's image with HEAD. Build a list of available
    // poses, then pick the highest-numbered as the default (in-flight
    // > perched, etc.). When only one pose remains, hide the toggle
    // entirely - no choice means no UI.
    var probes = poseBtns.map(function (b) {
      var pose = +b.dataset.pose;
      return fetch(sketchSrc(sci, pose), { method: 'HEAD', cache: 'no-store' })
        .then(function (r) { return { pose: pose, btn: b, ok: r.ok }; })
        .catch(function () { return { pose: pose, btn: b, ok: false }; });
    });
    Promise.all(probes).then(function (results) {
      var available = results.filter(function (r) { return r.ok; });
      available.forEach(function (r) { r.btn.removeAttribute('data-unavailable'); });
      results.filter(function (r) { return !r.ok; }).forEach(function (r) {
        r.btn.setAttribute('data-unavailable', 'true');
      });
      // Default to the highest-numbered available pose (in-flight if
      // present, else fall back to perched).
      var pick = available.sort(function (a, b) { return b.pose - a.pose; })[0];
      if (pick) {
        poseBtns.forEach(function (b) {
          b.setAttribute('aria-current', b === pick.btn ? 'true' : 'false');
        });
        img.src = sketchSrc(sci, pick.pose);
      }
      // Single-option => hide the chrome.
      if (available.length <= 1) {
        poseToggle.setAttribute('data-unavailable', 'true');
      }
      // Slide the white pill to the active button.
      syncPill(poseToggle);
    });
    document.getElementById('modalSci').textContent = sci;
    document.getElementById('modalGenus').textContent = (sci.split(' ')[0] || '-');
    document.getElementById('modalCommon').textContent = '-';
    document.getElementById('modalWindow').textContent = '-';
    document.getElementById('modalWindowLbl').textContent = 'observed ' + windowLabel(currentHours);
    document.getElementById('modalLastLocation').textContent = '-';
    document.getElementById('modalLastTime').textContent = '-';
    document.getElementById('modalRarity').textContent = '-';
    document.getElementById('modalRarity').classList.remove('rare');
    document.getElementById('modalDesc').textContent = 'Loading description...';
    document.getElementById('modalDesc').classList.add('placeholder');
    document.getElementById('modalWiki').href = wikiUrl(sci);
    document.getElementById('modalEbird').href = ebirdUrl(sci);
    // FLIP-style morph: scale + translate the modal-card from the
    // clicked atlas card's position to its natural centered size, so
    // the card *expands* into the detail view instead of just fading
    // in. The outer modal MUST become visible (aria-hidden=false)
    // before we apply the initial transform - the browser skips
    // layout for opacity-0 trees, which would freeze the morph at the
    // starting frame.
    var sourceCard = atlasGridEl
      ? atlasGridEl.querySelector('.bird-card[data-sci="' + sci.replace(/"/g, '\"') + '"]')
      : null;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    morphModalOpen(modal.querySelector('.modal-card'), sourceCard);

    // Species detail summary + every detection.
    var loadSpecies = SPECIES_CACHE[sci]
      ? Promise.resolve(SPECIES_CACHE[sci])
      : fetchJson(birdApi('action=species&sci=' + encodeURIComponent(sci))).then(function (j) {
        SPECIES_CACHE[sci] = j;
        return j;
      });
    loadSpecies.then(function (j) {
      var s = j.summary || {};
      document.getElementById('modalCommon').textContent = s.com || sci;
      var winRow = ((DATA.recent && DATA.recent.species) || []).filter(function (x) { return x.sci === sci; })[0];
      document.getElementById('modalWindow').textContent = (winRow ? +winRow.n : 0).toLocaleString();
      var lastObserved = lastObservedParts(s);
      document.getElementById('modalLastLocation').textContent = lastObserved.location;
      document.getElementById('modalLastTime').textContent = lastObserved.time;
      var rar = rarityLabel(+s.total || 0, s.first_observed);
      var rarEl = document.getElementById('modalRarity');
      rarEl.textContent = rar;
      if (rar === 'rare') rarEl.classList.add('rare');
    });

    // Wikipedia summary (description + genus / family).
    var loadWiki = WIKI_CACHE[sci]
      ? Promise.resolve(WIKI_CACHE[sci])
      : fetchJson(apiUrl('/avian/api/wiki.php?sci=') + encodeURIComponent(sci)).then(function (j) {
        WIKI_CACHE[sci] = j; return j;
      });
    loadWiki.then(function (j) {
      var desc = document.getElementById('modalDesc');
      desc.textContent = j.extract || 'No description available.';
      desc.classList.toggle('placeholder', !j.extract);
    }).catch(function () {
      var desc = document.getElementById('modalDesc');
      desc.textContent = 'No description available.';
      desc.classList.add('placeholder');
    });
  }
  function closeDetailModal() {
    var modal = document.getElementById('detail-modal');
    // Reverse-morph back into the source atlas card so the modal
    // appears to *retract* to where it came from. Look the card up
    // fresh - the user may have switched the time window or sort
    // since opening the modal, so the source card may have moved.
    var sci = (document.getElementById('modalSci').textContent || '').trim();
    var sourceCard = sci && atlasGridEl
      ? atlasGridEl.querySelector('.bird-card[data-sci="' + sci.replace(/"/g, '\"') + '"]')
      : null;
    morphModalClose(modal.querySelector('.modal-card'), sourceCard, function () {
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
  }

  // Shared-element morph: the modal-card scales+translates from the
  // clicked atlas card's exact rect to its natural centred rect, so the
  // little card appears to expand into the big one (and retract on
  // close). Only the card transforms; the container's opacity does the
  // single fade for backdrop + card together - no double-fade, and the
  // transform is cleared only once hidden so there's no mid-close snap.
  var atlasGridEl = document.getElementById('atlasGrid');
  var modalCloseResetTimer = null;
  function morphTransform(modalCard, sourceCard) {
    if (!modalCard || !sourceCard) return null;
    var s = sourceCard.getBoundingClientRect();
    // Source off-screen (opened from stats mid-slide, or scrolled away)
    // -> skip the morph and just fade, rather than fly in from nowhere.
    if (!s.width || s.bottom < 0 || s.top > window.innerHeight ||
      s.right < 0 || s.left > window.innerWidth) return null;
    var m = modalCard.getBoundingClientRect();
    if (!m.width) return null;
    var scale = Math.max(0.1, s.width / m.width);
    var dx = (s.left + s.width / 2) - (m.left + m.width / 2);
    var dy = (s.top + s.height / 2) - (m.top + m.height / 2);
    return 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) scale(' + scale.toFixed(4) + ')';
  }
  // Run cb once the transform transition finishes, with a timeout
  // fallback for environments where transitionend doesn't fire.
  function onceTransformEnd(el, cb, fallbackMs) {
    var fired = false;
    function handler(ev) {
      if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
      if (fired) return;
      fired = true;
      el.removeEventListener('transitionend', handler);
      cb();
    }
    el.addEventListener('transitionend', handler);
    setTimeout(handler, fallbackMs);
  }
  function morphModalOpen(modalCard, sourceCard) {
    var modal = document.getElementById('detail-modal');
    if (!modalCard) { modal.classList.add('is-open'); return; }
    if (modalCloseResetTimer) {
      clearTimeout(modalCloseResetTimer);
      modalCloseResetTimer = null;
    }
    // Identity first so we can measure the card's natural rect, then jump
    // it (no transition) to the source card's position + scale.
    modalCard.classList.remove('is-morphing');
    modalCard.style.transform = '';
    void modalCard.offsetWidth;
    var start = morphTransform(modalCard, sourceCard);
    if (start) {
      modalCard.style.transform = start;
      void modalCard.offsetWidth;
    }
    // Next tick: fade the container in and glide the card to identity.
    // setTimeout (not rAF) - rAF can stall in non-painting/headless
    // contexts; the forced reflow above already commits the start
    // transform so the transition interpolates cleanly from it.
    setTimeout(function () {
      modal.classList.add('is-open');
      if (start) {
        modalCard.classList.add('is-morphing');
        modalCard.style.transform = 'translate3d(0,0,0) scale(1)';
      }
    }, 0);
    if (start) {
      onceTransformEnd(modalCard, function () {
        // A close took over (is-open gone); clearing now snaps the card to centre.
        if (!modal.classList.contains('is-open')) return;
        modalCard.classList.remove('is-morphing');
        modalCard.style.transform = '';
      }, 360);
    }
  }
  function morphModalClose(modalCard, sourceCard, done) {
    var modal = document.getElementById('detail-modal');
    // Fade the container out (backdrop + card) and retract the card to
    // the source rect at the same time.
    modal.classList.remove('is-open');
    var end = modalCard ? morphTransform(modalCard, sourceCard) : null;
    var finish = function () {
      if (done) done();
      if (modalCard) {
        if (modalCloseResetTimer) clearTimeout(modalCloseResetTimer);
        modalCloseResetTimer = setTimeout(function () {
          modalCard.classList.remove('is-morphing');
          modalCard.style.transform = '';
          modalCloseResetTimer = null;
        }, 240);
      }
    };
    if (modalCard && end) {
      modalCard.classList.add('is-morphing');
      void modalCard.offsetWidth;
      modalCard.style.transform = end;
      onceTransformEnd(modalCard, finish, 360);
    } else {
      // No morph -> let the container opacity fade run, then hide.
      setTimeout(finish, 280);
    }
  }

  // Pose toggle inside the modal - swaps the sketch between perched
  // (default) and in-flight alt pose. A short opacity transition makes
  // the swap feel intentional rather than a hard cut.
  document.getElementById('modalPoseToggle').addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('button');
    if (!btn || btn.getAttribute('data-unavailable') === 'true') return;
    var pose = +btn.dataset.pose;
    var toggle = document.getElementById('modalPoseToggle');
    [].slice.call(toggle.querySelectorAll('button')).forEach(function (b) {
      b.setAttribute('aria-current', b === btn ? 'true' : 'false');
    });
    syncPill(toggle);
    var img = document.getElementById('modalImg');
    var sci = document.getElementById('modalSci').textContent;
    img.classList.add('swapping');
    setTimeout(function () {
      img.src = sketchSrc(sci, pose);
      img.addEventListener('load', function once() {
        img.classList.remove('swapping');
        img.removeEventListener('load', once);
      });
    }, 180);
  });

  // Expose for debugging during dev - also lets the modal be opened
  // from outside the IIFE if needed.
  window.__openDetailModal = openDetailModal;
  window.__closeDetailModal = closeDetailModal;

  // ===== Admin overlay (settings / system / logs / tools) =====
  // Lives in the same shell as the rest of the app - the menu button
  // and return-to-atlas pill stay put. The slider hides; this overlay
  // takes over the body. Navigation is via the drawer menu, NOT
  // internal tabs (the drawer is the canonical nav surface).
  var adminEl = document.getElementById('adminScreen');
  var adminBody = document.getElementById('adminBody');
  var adminTitle = document.getElementById('adminTitle');
  var adminPollT = null;
  var adminSect = null;
  var ADMIN_TITLES = {
    settings: 'Settings',
    system: 'System',
    logs: 'Logs',
    tools: 'Tools',
  };
  function adminEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function adminFmtBytes(n) {
    if (!n) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(n < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
  }
  function adminFmtAge(s) {
    if (s == null) return '-';
    if (s < 60) return s + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  }
  // Admin endpoints rely on the session cookie set by /api/auth/login -
  // no Authorization header needed (and nothing sensitive in JS-readable
  // storage). credentials: 'same-origin' is the default but spelled out
  // for clarity.
  function adminApi(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  }
  function openAdmin(section) {
    document.body.classList.add('admin-on');
    adminEl.setAttribute('aria-hidden', 'false');
    adminTitle.textContent = ADMIN_TITLES[section] || section;
    if (adminPollT) { clearInterval(adminPollT); adminPollT = null; }
    adminSect = section;
    if (section === 'settings') renderAdminSettings();
    else if (section === 'system') renderAdminSystem();
    else if (section === 'logs') renderAdminLogs();
    else if (section === 'tools') renderAdminTools();
  }
  function closeAdmin() {
    document.body.classList.remove('admin-on');
    adminEl.setAttribute('aria-hidden', 'true');
    if (adminPollT) { clearInterval(adminPollT); adminPollT = null; }
    adminSect = null;
  }

  function adminCard(title, value, sub, cls) {
    return '<div class="admin-card ' + (cls || '') + '">'
      + '<h3>' + adminEsc(title) + '</h3>'
      + '<div class="v">' + adminEsc(value) + '</div>'
      + (sub ? '<div class="sub">' + adminEsc(sub) + '</div>' : '')
      + '</div>';
  }
  function adminUnreachableHtml(reason) {
    return '<div class="admin-unreachable">Pi unreachable - ' + adminEsc(reason || 'no data') + '</div>';
  }

  function renderAdminSettings() {
    adminBody.innerHTML = '<p style="font:11px ui-monospace,monospace;color:var(--ink-soft);text-align:center">loading settings...</p>';
    fetch(apiUrl('/avian/api/config.php'), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (cfg) {
        var v = cfg.values || {};
        var preserve = cfg.preserve;
        adminBody.innerHTML =
          '<div class="admin-settings">'
          + themeRow()
          + settingsToggle('preserve', 'Preserve all recordings', "don't auto-delete", preserve)
          + settingsSlider('CONFIDENCE', 'Confidence threshold', 'min score to log a detection', v.CONFIDENCE, 0.1, 0.95, 0.05, 2)
          + settingsSlider('SENSITIVITY', 'Sensitivity', 'analyzer sensitivity', v.SENSITIVITY, 0.5, 1.5, 0.05, 2)
          + settingsSlider('OVERLAP', 'Chunk overlap', 'seconds analyzed per pass', v.OVERLAP, 0, 2.5, 0.1, 1)
          + settingsSegmented('FULL_DISK', 'When disk fills', '', v.FULL_DISK, [
            { v: 'keep', label: 'keep' },
            { v: 'purge', label: 'purge' },
          ])
          + '<div class="menu-save-row">'
          + '  <span class="save-state" id="saveState"></span>'
          + '  <button type="button" id="saveBtn" disabled>save</button>'
          + '</div>'
          + '</div>';
        wireSettingsControls(adminBody);
        adminBody.querySelectorAll('.seg').forEach(wireToggleAdvance);   // open-space advance
        // Theme switcher applies + persists immediately (separate from the
        // Pi config save below).
        var themeSeg = adminBody.querySelector('[data-theme-seg]');
        if (themeSeg) themeSeg.addEventListener('click', function (ev) {
          var b = ev.target.closest('button[data-theme]');
          if (!b) return;
          applyTheme(b.getAttribute('data-theme'));
          [].forEach.call(themeSeg.querySelectorAll('button'), function (x) {
            x.setAttribute('aria-current', x === b ? 'true' : 'false');
          });
        });
        var saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveSettings);
      })
      .catch(function (err) {
        adminBody.innerHTML = adminUnreachableHtml('settings load failed (' + err + ')');
      });
  }

  function renderAdminSystem() {
    adminBody.innerHTML = '<p style="font:11px ui-monospace,monospace;color:var(--ink-soft);text-align:center">loading...</p>';
    function tick() {
      adminApi(apiUrl('/avian/api/birdnet-status.php?action=diag'))
        .then(function (r) { return r.text().then(function (raw) { return { status: r.status, raw: raw }; }); })
        .then(function (res) {
          var j = null;
          try { j = JSON.parse(res.raw); } catch (e) { }
          if (res.status !== 200 || !j) {
            adminBody.innerHTML = adminUnreachableHtml(
              !j ? 'birdnet-status.php not installed on the pi' : (j.error || 'HTTP ' + res.status)
            );
            return;
          }
          adminBody.innerHTML = adminSystemMarkup(j);
          wireAdminRestarts();
        })
        .catch(function (e) { adminBody.innerHTML = adminUnreachableHtml(e.message); });
    }
    tick();
    adminPollT = setInterval(tick, 6000);
  }
  function adminSystemMarkup(j) {
    var sys = j.system || {}, svc = j.services || {}, recLogs = j.recent_logs || {};
    var stream = sys.stream_data || {}, db = sys.birds_db || {};
    var streamAlert = !stream.exists || stream.newest_age_s == null || stream.newest_age_s > 600;
    var dbAlert = db.exists && db.modified_s > 3600;
    var keySvcs = ['birdnet_recording', 'birdnet_analysis', 'birdnet_log'];
    var dead = keySvcs.filter(function (n) { return svc[n] && svc[n].active !== 'active'; });
    var html = '<div class="admin-grid">';
    html += adminCard('recording pipeline', dead.length === 0 ? 'live' : (dead.length + ' down'),
      dead.length === 0 ? 'all services active' : dead.join(', '),
      dead.length === 0 ? '' : 'alert');
    html += adminCard('newest live audio',
      stream.newest_age_s == null ? 'no chunks' : adminFmtAge(stream.newest_age_s) + ' ago',
      stream.newest_name || '',
      streamAlert ? 'alert' : '');
    html += adminCard('birds.db updated',
      db.exists ? adminFmtAge(db.modified_s) + ' ago' : 'missing',
      db.mtime || '',
      dbAlert ? 'warn' : '');
    html += adminCard('uptime', (sys.uptime || {}).pretty || '-',
      'load ' + ((sys.uptime || {}).load || []).map(function (n) { return n.toFixed(2); }).join(' / '));
    html += adminCard('cpu temp',
      sys.temp_c != null ? sys.temp_c.toFixed(1) + '°C' : '-',
      sys.hostname + ' · ' + sys.kernel,
      sys.temp_c != null && sys.temp_c > 75 ? 'warn' : '');
    html += adminCard('memory used', sys.mem ? sys.mem.used_pct + '%' : '-',
      sys.mem ? adminFmtBytes(sys.mem.used_bytes) + ' / ' + adminFmtBytes(sys.mem.total_bytes) : '',
      sys.mem && sys.mem.used_pct > 92 ? 'warn' : '');
    html += adminCard('disk (birdsongs)', sys.disk_birds ? sys.disk_birds.used_pct + '%' : '-',
      sys.disk_birds ? adminFmtBytes(sys.disk_birds.total_bytes - sys.disk_birds.free_bytes) + ' / ' + adminFmtBytes(sys.disk_birds.total_bytes) : '',
      sys.disk_birds && sys.disk_birds.used_pct > 92 ? 'warn' : '');
    var audio = sys.audio || {}, cards = audio.arecord_l || [];
    var mic = cards.find ? cards.find(function (c) { return /usb-audio|microphone|mic/i.test(c); }) : null;
    // Without a USB mic, /proc/asound/cards only lists the Pi's HDMI
    // audio outputs - which aren't an input source. Flag that clearly
    // rather than showing "audio device: vc4hdmi0" as if it were a mic.
    html += adminCard('audio device',
      mic || (cards.length ? 'no microphone attached' : 'no audio devices'),
      mic ? '' : (cards[0] || ''),
      mic ? '' : 'warn');
    html += '</div>';

    html += '<h2 class="admin-section-head">services</h2>';
    html += '<table class="admin-tbl"><thead><tr><th>unit</th><th>state</th><th>enabled</th><th>since</th><th></th></tr></thead><tbody>';
    Object.keys(svc).forEach(function (name) {
      var s = svc[name];
      var pill = (s.active === 'active') ? 'active' : (s.active === 'failed' ? 'failed' : 'inactive');
      html += '<tr>'
        + '<td>' + adminEsc(name) + '</td>'
        + '<td><span class="pill ' + pill + '">' + adminEsc(s.active) + '</span></td>'
        + '<td>' + adminEsc(s.enabled) + '</td>'
        + '<td>' + adminEsc(s.since || '-') + '</td>'
        + '<td><button class="restart" data-unit="' + adminEsc(name) + '">restart</button></td>'
        + '</tr>';
    });
    html += '</tbody></table>';

    var conf = (sys.conf || {}).values || {};
    var rows = Object.keys(conf).map(function (k) {
      return '<tr><td>' + adminEsc(k) + '</td><td>' + adminEsc(conf[k]) + '</td></tr>';
    }).join('');
    if (rows) {
      html += '<h2 class="admin-section-head">birdnet.conf</h2>';
      html += '<table class="admin-tbl"><tbody>' + rows + '</tbody></table>';
    }
    if (Object.keys(recLogs).length) {
      html += '<h2 class="admin-section-head">recent journal</h2>';
      Object.keys(recLogs).forEach(function (u) {
        html += '<h3 style="font:9.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);margin:12px 0 6px">' + adminEsc(u) + '</h3>';
        html += '<div class="admin-logs-pane">' + adminEsc(recLogs[u] || '(empty)') + '</div>';
      });
    }
    return html;
  }
  function wireAdminRestarts() {
    adminBody.querySelectorAll('button.restart').forEach(function (b) {
      b.addEventListener('click', function () {
        var unit = b.dataset.unit;
        if (!confirm('Restart ' + unit + '?')) return;
        b.disabled = true; var old = b.textContent; b.textContent = '...';
        fetch(apiUrl('/avian/api/birdnet-status.php?action=restart&unit=') + encodeURIComponent(unit), {
          method: 'POST', credentials: 'same-origin',
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            b.textContent = j.ok ? 'ok' : 'fail';
            setTimeout(function () { b.disabled = false; b.textContent = old; renderAdminSystem(); }, 1200);
          })
          .catch(function () { b.textContent = 'err'; b.disabled = false; setTimeout(function () { b.textContent = old; }, 1500); });
      });
    });
  }

  function renderAdminLogs() {
    var unit = 'birdnet_recording', lines = 120, autoScroll = true;
    adminBody.innerHTML =
      '<div class="admin-logs-toolbar">'
      + '  <label>unit</label><select id="adminLogsUnit">'
      // php-fpm unit name differs per Debian version (8.2 on Bookworm,
      // 8.4 on Trixie). List all three so the dropdown has the right one
      // regardless of host - birdnet-status.php's ALLOWED_UNITS already
      // skips ones systemd doesn't know about.
      + ['birdnet_recording', 'birdnet_analysis', 'birdnet_log', 'birdnet_stats', 'spectrogram_viewer', 'livestream', 'icecast2', 'caddy', 'php8.4-fpm', 'php8.3-fpm', 'php8.2-fpm']
        .map(function (u) { return '<option value="' + u + '">' + u + '</option>'; }).join('')
      + '  </select>'
      + '  <label>lines</label><input id="adminLogsLines" type="number" value="120" min="20" max="500" step="20">'
      + '</div>'
      + '<div class="admin-logs-pane" id="adminLogsOut">loading...</div>';
    var pane = document.getElementById('adminLogsOut');
    var sel = document.getElementById('adminLogsUnit');
    var linesIn = document.getElementById('adminLogsLines');
    sel.addEventListener('change', function () { unit = sel.value; tick(); });
    linesIn.addEventListener('change', function () { lines = +linesIn.value || 120; tick(); });
    pane.addEventListener('scroll', function () {
      autoScroll = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 20;
    });
    function tick() {
      adminApi(apiUrl('/avian/api/birdnet-status.php?action=logs&unit=') + encodeURIComponent(unit) + '&lines=' + lines)
        .then(function (r) { return r.text().then(function (raw) { return { status: r.status, raw: raw }; }); })
        .then(function (res) {
          var j = null;
          try { j = JSON.parse(res.raw); } catch (e) { }
          if (res.status !== 200 || !j) {
            pane.textContent = 'pi unreachable - ' + (j && j.error ? j.error : 'no data');
            return;
          }
          pane.textContent = j.text || '(empty)';
          if (autoScroll) pane.scrollTop = pane.scrollHeight;
        });
    }
    tick();
    adminPollT = setInterval(tick, 4000);
  }

  function renderAdminTools() {
    var actions = [
      ['restart birdnet_recording', 'picks up live audio from the mic. restart this first if observations stall.', 'birdnet_recording'],
      ['restart birdnet_analysis', 'runs the neural net on recorded chunks. restart if observations are stuck.', 'birdnet_analysis'],
      ['restart birdnet_log', 'writes the sqlite db. restart if api/stats stops updating.', 'birdnet_log'],
      ['restart spectrogram_viewer', 'live fft view (legacy) - used by /birdnet/spectrogram.', 'spectrogram_viewer'],
      ['restart livestream', 'icecast feed for the drawer live-audio button.', 'livestream'],
      ['restart icecast2', 'web audio streaming server (fronts livestream).', 'icecast2'],
    ];
    var html = '<div class="admin-actions-grid">';
    actions.forEach(function (a) {
      html += '<div class="admin-action">'
        + '<h4>' + adminEsc(a[0]) + '</h4>'
        + '<p>' + adminEsc(a[1]) + '</p>'
        + '<button class="run" type="button" data-unit="' + adminEsc(a[2]) + '">run</button>'
        + '<div class="out" data-out="' + adminEsc(a[2]) + '"></div>'
        + '</div>';
    });
    html += '</div>';
    html += '<h2 class="admin-section-head">heal / update</h2>';
    html += '<div class="admin-actions-grid">';
    function deployCard(title, desc, lines) {
      return '<div class="admin-action deploy">'
        + '<h4>' + adminEsc(title) + '</h4>'
        + '<p>' + adminEsc(desc) + '</p>'
        + '<pre>' + adminEsc(lines.join('\n')) + '</pre>'
        + '<button class="copy" type="button">copy</button>'
        + '</div>';
    }
    html += deployCard('pull latest from github',
      'fetches the newest AvianVisitors + BirdNET-Pi changes; the symlinks already in /BirdSongs/Extracted/ pick up new code on the next request.',
      [
        'cd ~/BirdNET-Pi && git pull',
        '# substitute the right php-fpm unit if your debian ships a different version:',
        'sudo systemctl reload caddy "$(systemctl list-unit-files \'php*-fpm.service\' --no-legend | awk \'{print $1; exit}\')"',
      ]);
    html += deployCard('rerun install_services.sh',
      'refreshes every symlink + service file. safe to run anytime; only takes ~10 seconds.',
      [
        'cd ~/BirdNET-Pi && ./scripts/install_services.sh',
      ]);
    html += '</div>';
    adminBody.innerHTML = html;
    // Wire restart buttons + copy buttons.
    adminBody.querySelectorAll('.admin-action button.run').forEach(function (b) {
      b.addEventListener('click', function () {
        var unit = b.dataset.unit;
        if (!confirm('restart ' + unit + '?')) return;
        b.disabled = true; var old = b.textContent; b.textContent = '...';
        var out = adminBody.querySelector('.out[data-out="' + unit.replace(/[^a-z0-9_.-]/gi, '_') + '"]');
        fetch(apiUrl('/avian/api/birdnet-status.php?action=restart&unit=') + encodeURIComponent(unit), {
          method: 'POST', credentials: 'same-origin',
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            b.textContent = j.ok ? 'restarted' : 'failed';
            if (out) out.textContent = (j.ok ? 'ok' : 'rc=' + j.rc) + (j.out ? '\n' + j.out : '');
            setTimeout(function () { b.disabled = false; b.textContent = old; }, 2000);
          })
          .catch(function (e) {
            b.textContent = 'error'; b.disabled = false;
            if (out) out.textContent = e.message || 'request failed';
            setTimeout(function () { b.textContent = old; }, 2000);
          });
      });
    });
    adminBody.querySelectorAll('.admin-action button.copy').forEach(function (b) {
      b.addEventListener('click', function () {
        var pre = b.previousElementSibling;
        if (!pre) return;
        navigator.clipboard.writeText(pre.textContent).then(function () {
          var old = b.textContent; b.textContent = 'copied ✓';
          setTimeout(function () { b.textContent = old; }, 1400);
        });
      });
    });
  }

  // Initial load: if URL has a sci hash, jump to atlas, highlight, and
  // open the modal.
  if (readHash()) { go(2); highlightAtlas(readHash()); openDetailModal(readHash()); }
  // Admin overlay routing: #admin=system|logs|tools opens the admin
  // screen with that sub-tab. Clearing the hash closes it.
  function readAdminHash() {
    var m = location.hash.match(/^#admin=([a-z]+)/);
    return m ? m[1] : null;
  }
  // #about - brief explainer popup; reached via /about (302 -> /#about)
  // or the masthead eyebrow. aria-hidden drives the CSS fade/slide.
  function openAbout() { document.getElementById('about-modal').setAttribute('aria-hidden', 'false'); }
  function closeAbout() { document.getElementById('about-modal').setAttribute('aria-hidden', 'true'); }
  function syncRouter() {
    window.__lastHashchange = Date.now();
    var sci = readHash();
    var adm = readAdminHash();
    if (location.hash === '#about') openAbout(); else closeAbout();
    if (adm) { openAdmin(adm); return; }
    closeAdmin();
    if (sci) { go(2); highlightAtlas(sci); openDetailModal(sci); }
    else { highlightAtlas(null); closeDetailModal(); }
  }
  if (readAdminHash()) openAdmin(readAdminHash());
  if (location.hash === '#about') openAbout();
  window.addEventListener('hashchange', syncRouter);

  // Modal interactions: backdrop / close button -> clear the hash.
  document.getElementById('detail-modal').addEventListener('click', function (ev) {
    if (ev.target.dataset && ev.target.dataset.close === '1') {
      if (location.hash) { location.hash = ''; } else { closeDetailModal(); }
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' &&
      document.getElementById('detail-modal').getAttribute('aria-hidden') === 'false') {
      if (location.hash) { location.hash = ''; } else { closeDetailModal(); }
    }
  });

  // About popup: backdrop / close / explore button all carry data-close,
  // which clears the hash and routes through syncRouter -> closeAbout.
  // The masthead eyebrow opens it; Escape dismisses it.
  document.getElementById('about-modal').addEventListener('click', function (ev) {
    if (ev.target.dataset && ev.target.dataset.close === '1') {
      if (location.hash) { location.hash = ''; } else { closeAbout(); }
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' &&
      document.getElementById('about-modal').getAttribute('aria-hidden') === 'false') {
      if (location.hash) { location.hash = ''; } else { closeAbout(); }
    }
  });

  // Stats help popup. The graph is re-rendered as data refreshes, so its
  // help button is handled by delegation from the stable stats view.
  var statsHelpModals = {
    graph: document.getElementById('stats-graph-help-modal'),
    table: document.getElementById('stats-table-help-modal')
  };
  function openStatsHelp(kind) {
    if (statsHelpModals[kind]) statsHelpModals[kind].setAttribute('aria-hidden', 'false');
  }
  function closeStatsHelp(modal) { modal.setAttribute('aria-hidden', 'true'); }
  document.getElementById('v1').addEventListener('click', function (ev) {
    var help = ev.target.closest && ev.target.closest('[data-stats-help]');
    if (help) openStatsHelp(help.getAttribute('data-stats-help'));
  });
  Object.keys(statsHelpModals).forEach(function (kind) {
    statsHelpModals[kind].addEventListener('click', function (ev) {
      if (ev.target.dataset && ev.target.dataset.close === '1') closeStatsHelp(statsHelpModals[kind]);
    });
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      Object.keys(statsHelpModals).forEach(function (kind) {
        var modal = statsHelpModals[kind];
        if (modal.getAttribute('aria-hidden') === 'false') closeStatsHelp(modal);
      });
    }
  });
  var timeWindowHelpModal = document.getElementById('time-window-help-modal');
  document.getElementById('windowHelp').addEventListener('click', function () {
    timeWindowHelpModal.setAttribute('aria-hidden', 'false');
  });
  timeWindowHelpModal.addEventListener('click', function (ev) {
    if (ev.target.dataset && ev.target.dataset.close === '1') {
      timeWindowHelpModal.setAttribute('aria-hidden', 'true');
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && timeWindowHelpModal.getAttribute('aria-hidden') === 'false') {
      timeWindowHelpModal.setAttribute('aria-hidden', 'true');
    }
  });
  var locationHelpModal = document.getElementById('location-help-modal');
  locationHelpModal.addEventListener('click', function (ev) {
    if (ev.target.dataset && ev.target.dataset.close === '1') {
      locationHelpModal.setAttribute('aria-hidden', 'true');
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && locationHelpModal.getAttribute('aria-hidden') === 'false') {
      locationHelpModal.setAttribute('aria-hidden', 'true');
    }
  });
  document.getElementById('aboutLink').addEventListener('click', function () {
    location.hash = '#about';
  });

  /* Removed audio playback and spectrogram implementation.
  // Shared decode context for spectrogram generation. Lives once for
  // the page; lazily created on first expand to avoid bootstrapping
  // WebAudio if no one ever opens a row.
  var _specAudioCtx = null;
  function getSpecCtx() {
    if (!_specAudioCtx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) _specAudioCtx = new C();
    }
    return _specAudioCtx;
  }

  // Cache decoded AudioBuffers per file so repeated expand/collapse on
  // the same row doesn't re-fetch + re-decode the mp3.
  var _decodedCache = {};

  // Minimal in-place Cooley-Tukey radix-2 FFT (n must be a power of 2).
  // Operates on parallel real/imag Float32Array buffers. ~30 lines and
  // fast enough for our ~1024-sample windows of 3-second clips.
  function _fft(real, imag) {
    var n = real.length;
    var j = 0;
    for (var i = 0; i < n - 1; i++) {
      if (i < j) {
        var tr = real[i]; real[i] = real[j]; real[j] = tr;
        var ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
      }
      var k = n >> 1;
      while (k <= j) { j -= k; k >>= 1; }
      j += k;
    }
    for (var stage = 2; stage <= n; stage *= 2) {
      var half = stage >> 1;
      var ang = -2 * Math.PI / stage;
      var wR = Math.cos(ang), wI = Math.sin(ang);
      for (var sBase = 0; sBase < n; sBase += stage) {
        var cR = 1, cI = 0;
        for (var sb = 0; sb < half; sb++) {
          var a = sBase + sb;
          var b = a + half;
          var trA = real[b] * cR - imag[b] * cI;
          var tiA = real[b] * cI + imag[b] * cR;
          real[b] = real[a] - trA;
          imag[b] = imag[a] - tiA;
          real[a] = real[a] + trA;
          imag[a] = imag[a] + tiA;
          var nR = cR * wR - cI * wI;
          cI = cR * wI + cI * wR;
          cR = nR;
        }
      }
    }
  }

  // Paint an STFT spectrogram onto the strip's canvas. y-axis is the
  // bird audible band (~200 Hz - ~10 kHz) on a mildly compressed log
  // scale; x-axis is time across the whole clip; colour is dB
  // magnitude mapped to our warm ink palette over the dark paper-ink
  // ground.
  function paintSpectrogram(canvas, audioBuffer) {
    // Defer to the next animation frame so the canvas has been laid out
    // (the parent strip may still be mid-transition expanding from 0).
    // Without this, subsequent expansions paint onto a zero-sized canvas.
    requestAnimationFrame(function () {
      _paintSpectrogramNow(canvas, audioBuffer);
    });
  }
  function _paintSpectrogramNow(canvas, audioBuffer) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    // Read parent strip's box, not the canvas (canvas might be 0-sized
    // briefly during expansion). The strip's expanded height is 88px;
    // width is the row width.
    var strip = canvas.parentElement;
    var cssW = strip ? strip.clientWidth : (canvas.clientWidth || 600);
    var cssH = strip ? strip.clientHeight : (canvas.clientHeight || 88);
    if (cssW < 32 || cssH < 32) {
      // Strip still collapsing in. Retry a frame later.
      requestAnimationFrame(function () { _paintSpectrogramNow(canvas, audioBuffer); });
      return;
    }
    var W = Math.max(1, Math.floor(cssW * dpr));
    var H = Math.max(1, Math.floor(cssH * dpr));
    canvas.width = W; canvas.height = H;

    var ctx = canvas.getContext('2d');
    var samples = audioBuffer.getChannelData(0);
    var sr = audioBuffer.sampleRate;
    var FFT_SIZE = 1024;
    var bins = FFT_SIZE >> 1;
    var nyquist = sr / 2;

    // Frequency-band mapping (Hz -> bin) for the bird-relevant band.
    // Most North American songbirds + corvids range 250 Hz - 8 kHz, but
    // hummingbirds, kinglets, and warblers reach 12 kHz. Push the cap
    // up so we don't miss the high-frequency tail.
    var fLo = 200, fHi = Math.min(12000, nyquist);
    var binLo = Math.max(1, Math.floor(fLo / nyquist * bins));
    var binHi = Math.min(bins - 1, Math.ceil(fHi / nyquist * bins));

    // Hann window
    var win = new Float32Array(FFT_SIZE);
    for (var i = 0; i < FFT_SIZE; i++) {
      win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
    }

    // Choose a hop that lays exactly W columns over the whole clip.
    var hop = Math.max(1, Math.floor((samples.length - FFT_SIZE) / Math.max(1, W - 1)));
    var real = new Float32Array(FFT_SIZE);
    var imag = new Float32Array(FFT_SIZE);

    var imgData = ctx.createImageData(W, H);
    var data = imgData.data;

    // Paper ground; ink intensifies where there's audio energy. Theme-
    // aware so dark mode gets a charcoal ground with a light trace instead
    // of a glaring light rectangle (matches --paper / --ink per theme).
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var BG_R = dark ? 23 : 245, BG_G = dark ? 24 : 240, BG_B = dark ? 28 : 230;
    var FG_R = dark ? 236 : 26, FG_G = dark ? 232 : 22, FG_B = dark ? 225 : 18;
    for (var p = 0; p < data.length; p += 4) {
      data[p] = BG_R; data[p + 1] = BG_G; data[p + 2] = BG_B; data[p + 3] = 255;
    }

    // Precompute row -> bin map (log-ish so low freqs get more space).
    var rowToBin = new Int32Array(H);
    for (var row = 0; row < H; row++) {
      var t = 1 - row / (H - 1); // 1 at top, 0 at bottom
      var bin = Math.round(binLo + (binHi - binLo) * Math.pow(t, 1.55));
      rowToBin[row] = Math.max(binLo, Math.min(binHi, bin));
    }

    for (var col = 0; col < W; col++) {
      var start = col * hop;
      if (start + FFT_SIZE > samples.length) break;
      for (var s = 0; s < FFT_SIZE; s++) {
        real[s] = samples[start + s] * win[s];
        imag[s] = 0;
      }
      _fft(real, imag);
      for (var row2 = 0; row2 < H; row2++) {
        var bin2 = rowToBin[row2];
        var re = real[bin2], im = imag[bin2];
        var mag = Math.sqrt(re * re + im * im);
        // log compress; -75 .. -10 dB -> 0 .. 1
        var db = 20 * Math.log10(mag + 1e-9);
        var v = (db + 75) / 65;
        if (v < 0) v = 0; else if (v > 1) v = 1;
        // Ink-on-paper palette: low energy -> paper, high energy -> ink.
        // Smoothstep for a softer falloff between the two extremes.
        var e = v * v * (3 - 2 * v);
        var r = BG_R + Math.round((FG_R - BG_R) * e);
        var g = BG_G + Math.round((FG_G - BG_G) * e);
        var b = BG_B + Math.round((FG_B - BG_B) * e);
        var px = (row2 * W + col) * 4;
        data[px] = r; data[px + 1] = g; data[px + 2] = b; data[px + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    canvas.classList.add('ready');
  }

  // Lazy-add + paint the canvas-based spectrogram for a row's strip.
  // Decoded buffers are cached per file so re-expanding is instant.
  function ensureSpectroImage(row) {
    var file = row && row.dataset.file;
    if (!file) return;
    var strip = row.querySelector('.rec-spectro');
    if (!strip) return;
    var loadingEl = strip.querySelector('.rec-spectro-loading');
    var canvas = strip.querySelector('canvas');
    if (canvas && canvas.classList.contains('ready')) {
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }
    if (!canvas) {
      canvas = document.createElement('canvas');
      var played = strip.querySelector('.rec-spectro-played');
      strip.insertBefore(canvas, played);
    }
    if (loadingEl) {
      loadingEl.style.display = '';
      loadingEl.textContent = 'rendering spectrogram...';
    }

    function done() {
      if (loadingEl) loadingEl.style.display = 'none';
    }
    function fail(reason) {
      if (loadingEl) {
        loadingEl.style.display = '';
        loadingEl.textContent = reason || 'spectrogram unavailable';
      }
    }

    if (_decodedCache[file]) {
      paintSpectrogram(canvas, _decodedCache[file]);
      done();
      return;
    }
    var ctx = getSpecCtx();
    if (!ctx) { fail('WebAudio not available'); return; }
    fetch(apiUrl('/avian/api/recording.php?file=') + encodeURIComponent(file))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (buf) { return ctx.decodeAudioData(buf); })
      .then(function (audioBuffer) {
        _decodedCache[file] = audioBuffer;
        paintSpectrogram(canvas, audioBuffer);
        done();
      })
      .catch(function (e) {
        fail('spectrogram failed: ' + (e && e.message ? e.message : ''));
      });
  }

  // Per-recording row interactions in the modal:
  //   - Clicking anywhere on the row toggles the spectrogram strip
  //     (independent of playback). Click again to collapse.
  //   - Clicking the play button toggles audio playback. Playback shows
  //     the moving cursor on whatever strip is already expanded; if the
  //     strip is collapsed, playing also expands it.
  //   - Clicking on the spectrogram itself scrubs (handled in the
  //     mousedown/touchstart wiring further down).
  document.getElementById('modalRecordings').addEventListener('click', function (ev) {
    if (!ev.target.closest) return;
    // Scrub-region clicks are handled by the mousedown wiring below.
    if (ev.target.closest('.rec-spectro-scrub')) return;

    var playBtn = ev.target.closest('.play');
    if (playBtn) {
      // Play / pause toggle. Three cases:
      //   (a) clicking the playing row's button -> pause (KEEP audio
      //       alive so the user can scrub then resume).
      //   (b) clicking a paused row's button (it's still modalRecBtn,
      //       audio still alive, just paused) -> resume from cursor.
      //   (c) clicking a different row's button -> stop the old, start
      //       the new.
      var prow = playBtn.closest('.rec-row');
      var pfile = prow && prow.dataset.file;
      if (!pfile) return;

      if (modalRecBtn === playBtn && modalAudio) {
        // Same row's button - toggle pause/resume.
        if (modalAudio.paused) {
          playBtn.setAttribute('data-active', 'true');
          playBtn.innerHTML = ICON_PAUSE;
          audioClaim(stopModalAudio);   // stop any card / live-stream audio
          modalAudio.play().catch(function () { });
        } else {
          pauseModalAudio();
        }
        return;
      }

      // Different row (or no current playback) - stop any current,
      // start fresh.
      stopModalAudio();
      audioClaim(stopModalAudio);   // stop any card / live-stream audio
      playBtn.setAttribute('data-active', 'true');
      playBtn.innerHTML = ICON_PAUSE;
      modalRecBtn = playBtn;
      prow.classList.add('expanded');
      ensureSpectroImage(prow);
      var strip = prow.querySelector('.rec-spectro');
      var audio = new Audio(apiUrl('/avian/api/recording.php?file=') + encodeURIComponent(pfile));
      modalAudio = audio;
      audio.addEventListener('loadedmetadata', function () {
        strip.classList.add('armed');
      });
      audio.addEventListener('playing', startCursorLoop);
      audio.addEventListener('pause', stopCursorLoop);
      audio.addEventListener('ended', function () {
        // Natural end: rewind cursor + keep audio so user can replay.
        stopCursorLoop();
        var p = strip.querySelector('.rec-spectro-played');
        var c = strip.querySelector('.rec-spectro-cursor');
        if (p) p.style.width = '0%';
        if (c) c.style.left = '0%';
        if (modalAudio) modalAudio.currentTime = 0;
        if (modalRecBtn) {
          modalRecBtn.removeAttribute('data-active');
          modalRecBtn.innerHTML = ICON_PLAY;
        }
      });
      audio.addEventListener('error', function () {
        stopModalAudio();
        playBtn.innerHTML = '<span style="font-size:8px">!</span>';
        setTimeout(function () { playBtn.innerHTML = ICON_PLAY; }, 1500);
      });
      audio.play().catch(function () { stopModalAudio(); });
      return;
    }

    // Row click anywhere else -> toggle strip open/closed.
    var row = ev.target.closest('.rec-row');
    if (!row) return;
    var willExpand = !row.classList.contains('expanded');
    if (willExpand) {
      row.classList.add('expanded');
      ensureSpectroImage(row);
    } else {
      // Collapsing the row where playback is happening also stops audio
      // (the cursor would just be hidden otherwise).
      if (modalRecBtn && modalRecBtn.closest('.rec-row') === row) stopModalAudio();
      row.classList.remove('expanded');
    }
  });

  // Scrub by clicking / dragging on the spectrogram strip.
  (function () {
    var dragRow = null;
    function seekFromEvent(row, clientX) {
      if (!modalAudio || !modalAudio.duration) return;
      var rowBtn = row.querySelector('.play');
      if (rowBtn !== modalRecBtn) return;
      var strip = row.querySelector('.rec-spectro');
      var rect = strip.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      modalAudio.currentTime = pct * modalAudio.duration;
      // Repaint cursor + played immediately so the user sees the scrub
      // even when audio is paused (rAF loop isn't running then).
      var pctStr = (pct * 100).toFixed(2) + '%';
      var played = strip.querySelector('.rec-spectro-played');
      var cur = strip.querySelector('.rec-spectro-cursor');
      if (played) played.style.width = pctStr;
      if (cur) cur.style.left = pctStr;
    }
    document.getElementById('modalRecordings').addEventListener('mousedown', function (ev) {
      var s = ev.target.closest && ev.target.closest('.rec-spectro-scrub');
      if (!s) return;
      var row = s.closest('.rec-row');
      if (!row || !row.classList.contains('expanded')) return;
      dragRow = row;
      seekFromEvent(row, ev.clientX);
      ev.preventDefault();
    });
    document.addEventListener('mousemove', function (ev) {
      if (!dragRow) return;
      seekFromEvent(dragRow, ev.clientX);
    });
    document.addEventListener('mouseup', function () { dragRow = null; });
    // Touch.
    document.getElementById('modalRecordings').addEventListener('touchstart', function (ev) {
      var s = ev.target.closest && ev.target.closest('.rec-spectro-scrub');
      if (!s) return;
      var row = s.closest('.rec-row');
      if (!row || !row.classList.contains('expanded')) return;
      dragRow = row;
      seekFromEvent(row, ev.touches[0].clientX);
      ev.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', function (ev) {
      if (!dragRow) return;
      seekFromEvent(dragRow, ev.touches[0].clientX);
    });
    document.addEventListener('touchend', function () { dragRow = null; });
  })();

  */

  // Any element with data-sci is a "jump to that bird's atlas card"
  // affordance: atlas cards themselves, stats list rows (top species),
  // stats timeline squares, and any future surface
  // that wants to point at a bird. Action chips inside cards stop
  // propagation themselves.
  function jumpToSci(sci) {
    if (!sci) return;
    if (location.hash !== '#sci=' + encodeURIComponent(sci)) {
      location.hash = '#sci=' + encodeURIComponent(sci);
    } else {
      // Same hash -> still re-highlight (the user clicked it again).
      go(2); highlightAtlas(sci);
    }
  }
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest) return;
    var card = ev.target.closest('.bird-card');
    if (card) {
      if (ev.target.closest('.actions')) return;
      return jumpToSci(card.dataset.sci);
    }
    var row = ev.target.closest('li[data-sci]');
    if (row) return jumpToSci(row.dataset.sci);
    var tlCol = ev.target.closest('.stats-tl-col[data-sci]');
    if (tlCol) return jumpToSci(tlCol.dataset.sci);
  });

  // After the atlas re-renders (window change, fresh fetch), re-apply
  // any active hash so the highlight survives a rebuild.
  var _origRenderAtlas = renderAtlas;
  renderAtlas = function (animate) {
    _origRenderAtlas(animate);
    var s = readHash();
    if (s) highlightAtlas(s);
  };
})();
