=== page--alliance ===
---
layout: default
page_key: "alliance"
active_nav: alliance
nav_links:
  - name_key: "nap_alliances"
    url: "#nap-alliances"
  - name_key: "nap_academies"
    url: "#nap-academies"
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
title: "NAP Alliances"
nav_id: "nap-alliances"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_alliances %}

<h2>{{ p.title }}</h2>

<table class="list-table" id="nap-alliance-table">
  {% for alliance in site.data.diplomacy.nap_alliances %}
  <tr><td>{{ alliance }}</td></tr>
  {% endfor %}
</table>

=== collection--alliance--02 ===
---
title: "NAP Academies"
nav_id: "nap-academies"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_academies %}

<h2>{{ p.title }}</h2>

<table class="list-table">
  {% for academy in site.data.diplomacy.nap_academies %}
  <tr>
    <td>
      <strong>{{ academy.name }}</strong>
      <span class="sub-text">{{ p.text }}{{ academy.parent }}</span>
    </td>
  </tr>
  {% endfor %}
</table>

=== collection--alliance--03 ===
---
title: "NAP Ranks"
nav_id: "nap-ranks"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_ranks %}

<h2>{{ p.title }}</h2>
<p>{{ p.text }}</p>

<table class="list-table" id="nap-ranks-table">
  {% for alliance in site.data.diplomacy.nap_ranks %}
  <tr>
    <td style="width: 30px; font-weight: bold; color: var(--accent-color);">{{ forloop.index }}.</td>
    <td>{{ alliance }}</td>
  </tr>
  {% endfor %}
</table>

=== collection--alliance--04 ===
---
title: "NAP Territory"
nav_id: "nap-territory"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_territory %}

<h2>{{ p.title }}</h2>

<img src="/images/map.jpg" alt="NAP Territory Map" class="blueprint-img" onclick="document.getElementById('mapZoom').showModal()" style="cursor: pointer; margin-top: 10px;">

=== collection--alliance--05 ===
---
title: "Blacklist"
nav_id: "blacklist"
---

{% assign p = site.data[site.active_lang].content.alliance_page.blacklist %}

<h2>{{ p.title }}</h2>
<p>{{ p.text }}</p>

<table class="list-table">
  {% for player in site.data.diplomacy.blacklist_players %}
  <tr><td>{{ player }}</td></tr>
  {% endfor %}
</table>

<p>{{ p.text2 }}</p>

<table class="list-table">
  {% for alliance in site.data.diplomacy.blacklist_alliances %}
  <tr><td>{{ alliance }}</td></tr>
  {% endfor %}
</table>
