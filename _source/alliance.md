=== page--alliance ===
---
layout: default
page_key: "alliance"
active_nav: alliance
nav_links:
  - name_key: "nap_ranks"
    url: "#nap-ranks"
  - name_key: "nap_territory"
    url: "#nap-territory"
  - name_key: "blacklist"
    url: "#blacklist"
dialogs:
  - dialogs/alliance.html
---

{% for section in site.alliance %}
  <section class="content-pane" id="{{ section.nav_id }}">
      {{ section.content }}
  </section>
{% endfor %}

=== collection--alliance--01 ===
---
title: "NAP Standings & Hierarchy"
nav_id: "nap-ranks"
---

{% assign p_alliances = site.data[site.active_lang].content.alliance_page.nap_alliances %}
{% assign p_ranks = site.data[site.active_lang].content.alliance_page.nap_ranks %}

<div id="alliance-container" class="alliance-wrapper">
  <!-- Controls Bar -->
  <div class="map-controls">
    <div class="control-group left">
      <span class="control-label">NAP Roster:</span>
      <span id="alliance-total-count" class="badge">-- Alliances</span>
    </div>
    <div class="control-group right">
      <button id="btn-toggle-alliance-planner" class="draft-btn" aria-pressed="false" type="button">
        <span class="draft-indicator"></span>
        <span class="draft-text">Planner Mode</span>
      </button>
      <button id="btn-submit-alliance" class="submit-plan-btn hidden" disabled type="button">
        Submit Plan <span id="alliance-change-badge" class="badge">0</span>
      </button>
    </div>
  </div>

  <div class="content-pane-inner">
    <h2>{{ p_ranks.title | default: "NAP Standings & Hierarchy" }}</h2>
    <p>{{ p_ranks.text | default: "Official NAP rankings and protected academy designations." }}</p>

    <!-- Standings Hierarchy List (Rendered dynamically via js/alliance.js) -->
    <div id="alliance-hierarchy-list" class="alliance-hierarchy-list">
      <!-- Injected by JavaScript -->
    </div>

    <!-- Planner Action: Add Contender Row -->
    <div id="planner-add-alliance-container" class="planner-actions hidden">
      <div class="add-alliance-inline">
        <input type="text" id="input-new-tag" placeholder="TAG (e.g. WLO)" maxlength="6" />
        <input type="text" id="input-new-name" placeholder="Full Alliance Name" />
        <button id="btn-add-alliance" class="draft-btn" type="button">+ Add Contender</button>
      </div>
    </div>
  </div>
</div>

<script id="diplomacy-data-bootstrap" type="application/json">
  {{ site.data.diplomacy | jsonify }}
</script>
<script id="map-state-bootstrap" type="application/json">
  {{ site.data.map_state | jsonify }}
</script>

=== collection--alliance--02 ===
---
title: "NAP Territory"
nav_id: "nap-territory"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_territory %}

<h2>{{ p.title }}</h2>

{% include map.html %}

=== collection--alliance--03 ===
---
title: "Blacklist"
nav_id: "blacklist"
---

{% assign p = site.data[site.active_lang].content.alliance_page.blacklist %}

<h2>{{ p.title }}</h2>
<p>{{ p.text }}</p>

<div class="blacklist-section">
  <div class="blacklist-group">
    <div class="blacklist-header">
      <h3>🚫 Blacklisted Players</h3>
      <span id="blacklist-player-count" class="badge">0</span>
    </div>
    <div id="blacklist-players-container" class="blacklist-card-list">
      <!-- Injected by js/alliance.js -->
    </div>
    <div id="planner-add-player-box" class="planner-blacklist-add hidden">
      <input type="text" id="input-new-player" placeholder="Player IGN" />
      <button id="btn-add-blacklist-player" class="draft-btn" type="button">+ Add</button>
    </div>
  </div>

  <div class="pane-divider"></div>

  <div class="blacklist-group">
    <div class="blacklist-header">
      <h3>⚠️ Blacklisted Alliances</h3>
      <span id="blacklist-alliance-count" class="badge">0</span>
    </div>
    <div id="blacklist-alliances-container" class="blacklist-card-list">
      <!-- Injected by js/alliance.js -->
    </div>
    <div id="planner-add-blacklist-alliance-box" class="planner-blacklist-add hidden">
      <input type="text" id="input-new-blacklist-alliance" placeholder="Alliance TAG" maxlength="6" />
      <button id="btn-add-blacklist-alliance" class="draft-btn" type="button">+ Add</button>
    </div>
  </div>
</div>

<script type="module" src="/js/alliance.js" defer></script>
