---
layout: default
page_key: "map"
permalink: /map/
lang: "en"
---
<section class="content-pane">
  <div id="map-container">
  <!-- map controls -->
  <div class="map-controls">
      <span class="control-label">View Mode:</span>
      <div class="segmented-control">
        <button id="btn-mode-level" class="toggle-btn active" data-mode="level">City Levels</button>
        <button id="btn-mode-alliance" class="toggle-btn" data-mode="alliance">Alliance Colors</button>
      </div>
    </div>
    <!-- 1. Scout Hover Tooltip -->
    <div id="map-tooltip"></div>
    <div class="game-map">
    {% include map.svg %}
    </div>
    <!-- Territory Detail Card -->
  <div id="territory-info-card" class="info-card idle">
    <div class="info-header">
      <span id="city-level-badge" class="badge">Level --</span>
      <h3 id="city-name">Hover over a territory</h3>
    </div>
    <div class="info-body">
      <p><strong>Owner:</strong> <span id="city-owner">Unclaimed</span></p>
      <p><strong>Territory Buff:</strong> <span id="city-buff">None</span></p>
    </div>
  </div>
  </div>
</section>
<script>
  window.MAP_STATE = {{ site.data.map_state | jsonify }};
</script>
<script type="module" src="/js/map.js" defer></script>