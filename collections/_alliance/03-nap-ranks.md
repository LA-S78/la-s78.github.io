---
title: "NAP Ranks"
nav_id: "nap-ranks"
---

The current Top 4 alliance hierarchy within the NAP:

<table class="list-table">
  {% for alliance in site.data.diplomacy.nap_ranks %}
  <tr>
    <td style="width: 30px; font-weight: bold; color: var(--accent-color);">{{ forloop.index }}.</td>
    <td>{{ alliance }}</td>
  </tr>
  {% endfor %}
</table>