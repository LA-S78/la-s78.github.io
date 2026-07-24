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

    <!-- 3. Selected Territory Command Intel Pane -->
  <div id="territory-intel-pane">
      <h3 id="intel-title">Select a Territory</h3>
      <p id="intel-body">Click any region on the map above to view city info, buffs, etc.</p>
  </div>
  </div>

</section>
<script src="/scripts/map.js" defer></script>