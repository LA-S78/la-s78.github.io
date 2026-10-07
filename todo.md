<div class="content-pane" style="max-width: 560px;" markdown="1">

# 📋 Todo

## 🔴 High Priority (Core)
- [ ] **Fix `/map` Image Generation** — Verify XML-safe tag rewrite in `api/map-image.js` so Discord proxy renders all 3 views cleanly.
- [ ] **Register `/map` Slash Command** — Push updated schema to Discord API with explicit `view` options (`level`, `alliance`, `resource`).
- [ ] **Audit Residual "Iron" Mentions** — Clean out lingering references across `_data/cities.yml` and static guides.

## 🟡 Mid Priority (Pipelines & Systems)
- [ ] **Enhanced Event Calendar** — Alliance-agnostic web scheduler with automated, delayed Discord `@Role` alerts.
- [ ] **Alliance Might OCR Pipeline** — Leaderboard screenshot scanner via Gemini 2.5 Flash to automatically sort standings.
- [ ] **Infographic Translation Pipeline** — SVG XML text-swapping/build pipeline to translate Canva guide graphics across 8 languages.
- [ ] **King's Console Reset Flow** — Sync frontend checklist clearing on `distribute.html` with `/rewards reset`.
- [ ] **Bot String Localization** — Populate localized embed strings under `map.views` in `_data/<lang>/`.

## 🟢 Low Priority (Tools & Polish)
- [ ] **Building Prerequisite Tree** — Interactive Keep 1–30+ dependency graph (modeled on the T10 calculator architecture).
- [ ] **Interactive Capitol Rotation Tool** — Dynamic web dashboard on `rules.html` replacing static blueprint graphic.
- [ ] **T10 Calculator CSS Layout** — Polish branch connectors, node scaling, and mobile viewport touch targets.
- [ ] **PWA & Cache Audit** — Verify offline service worker caching rules for textures and update toast.

</div>