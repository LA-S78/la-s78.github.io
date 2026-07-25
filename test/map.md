---
layout: default
page_key: "map"
permalink: /map/
lang: "en"
---
<section class="content-pane">
  <div id="map-container">
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
<script type="module" src="/js/map.js" defer></script>