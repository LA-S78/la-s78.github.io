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
  - name_key: "nap_stats"
    url: "#nap-stats"
strings: [alliance_planner, blacklist_planner, map_planner, proposals, live_data, stats]
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
      <span class="control-label">{{ "alliance_planner.roster" | t }}</span>
      <span id="alliance-total-count" class="badge">{{ "alliance_planner.roster_loading" | t }}</span>
    </div>
    <div class="control-group right">
      <button id="btn-toggle-alliance-planner" class="draft-btn" aria-pressed="false" type="button">
        <span class="draft-indicator"></span>
        <span class="draft-text">{{ "alliance_planner.planner_mode" | t }}</span>
      </button>
      <button id="btn-submit-alliance" class="submit-plan-btn" disabled type="button">
        {{ "alliance_planner.submit_plan" | t }} <span id="alliance-change-badge" class="badge">0</span>
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
        <input type="text" id="input-new-tag" placeholder="{{ "alliance_planner.tag_placeholder" | t }}" maxlength="6" />
        <input type="text" id="input-new-name" placeholder="{{ "alliance_planner.name_placeholder" | t }}" />
        <button id="btn-add-alliance" class="draft-btn" type="button">{{ "alliance_planner.add_contender" | t }}</button>
      </div>
    </div>
  </div>
</div>


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
      <h3>{% include ui-icon.html name="ban" %}{{ "blacklist_planner.players_title" | t }}</h3>
      <span id="blacklist-player-count" class="badge">0</span>
    </div>
    <div id="blacklist-players-container" class="blacklist-card-list">
      <!-- Injected by js/alliance.js -->
    </div>
    <div id="planner-add-player-box" class="planner-blacklist-add hidden">
      <input type="text" id="input-new-player" placeholder="{{ "blacklist_planner.player_placeholder" | t }}" />
      <button id="btn-add-blacklist-player" class="draft-btn" type="button">{{ "blacklist_planner.add" | t }}</button>
    </div>
  </div>

  <div class="pane-divider"></div>

  <div class="blacklist-group">
    <div class="blacklist-header">
      <h3>{% include ui-icon.html name="warning" tone="warn" %}{{ "blacklist_planner.alliances_title" | t }}</h3>
      <span id="blacklist-alliance-count" class="badge">0</span>
    </div>
    <div id="blacklist-alliances-container" class="blacklist-card-list">
      <!-- Injected by js/alliance.js -->
    </div>
    <div id="planner-add-blacklist-alliance-box" class="planner-blacklist-add hidden">
      <input type="text" id="input-new-blacklist-alliance" placeholder="{{ "blacklist_planner.alliance_placeholder" | t }}" maxlength="6" />
      <button id="btn-add-blacklist-alliance" class="draft-btn" type="button">{{ "blacklist_planner.add" | t }}</button>
    </div>
  </div>
</div>

<script type="module" src="/js/alliance.js" defer></script>

=== collection--alliance--04 ===
---
title: "Stats"
nav_id: "nap-stats"
---

<!-- The Stats tab (owner request, 2026-11-19): views of the NAP's numbers over time, from a
     daily snapshot of the Last Asylum Tracker (api/_stats.js). Drawn by js/stats.js. -->
<h2>{{ "stats.title" | t }}</h2>
<div class="stats-app" id="stats-app">
  <div class="stats-bar">
    <div class="segmented-control stats-views" role="group" aria-label="{{ "stats.views_label" | t }}">
      <button type="button" class="toggle-btn active" data-stats-view="growth" aria-pressed="true">{{ "stats.view_growth" | t }}</button>
      <button type="button" class="toggle-btn" data-stats-view="players" aria-pressed="false">{{ "stats.view_players" | t }}</button>
    </div>
    <div class="segmented-control stats-range" role="group" aria-label="{{ "stats.range_label" | t }}">
      <button type="button" class="toggle-btn" data-stats-range="7" aria-pressed="false">{{ "stats.range_week" | t }}</button>
      <button type="button" class="toggle-btn active" data-stats-range="30" aria-pressed="true">{{ "stats.range_month" | t }}</button>
      <button type="button" class="toggle-btn" data-stats-range="all" aria-pressed="false">{{ "stats.range_all" | t }}</button>
    </div>
  </div>
  <div class="stats-body" id="stats-body"><p class="stats-note">{{ "stats.loading" | t }}</p></div>
  <p class="stats-credit">{% include ui-icon.html name="users" %}{{ "stats.credit_before" | t }} <a href="https://lastasylumtracker.com/" target="_blank" rel="noopener">Last Asylum Tracker</a></p>
</div>

<script type="module" src="/js/stats.js" defer></script>
