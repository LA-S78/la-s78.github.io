---
title: "NAP Ranks"
nav_id: "nap-ranks"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_alliances %}

<h2>{{ p.title }}</h2>
<p>{{ p.text }}</p>

<table class="list-table">
  {% for alliance in site.data.diplomacy.nap_ranks %}
  <tr>
    <td style="width: 30px; font-weight: bold; color: var(--accent-color);">{{ forloop.index }}.</td>
    <td>{{ alliance }}</td>
  </tr>
  {% endfor %}
</table>