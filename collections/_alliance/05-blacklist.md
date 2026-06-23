---
title: "Blacklist"
nav_id: "blacklist"
---

The following players are banned from NAP alliances and are kill-on-sight:

<table class="list-table">
  {% for player in site.data.diplomacy.blacklist_players %}
  <tr><td>{{ player }}</td></tr>
  {% endfor %}
</table>

The following alliances are kill-on-sight:

<table class="list-table">
  {% for alliance in site.data.diplomacy.blacklist_alliances %}
  <tr><td>{{ alliance }}</td></tr>
  {% endfor %}
</table>