---
title: "Blacklist"
nav_id: "blacklist"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_blacklist %}

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