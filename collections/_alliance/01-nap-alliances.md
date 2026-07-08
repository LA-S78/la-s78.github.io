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