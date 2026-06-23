---
title: "NAP Alliances"
nav_id: "nap-alliances"
---

<table class="list-table">
  {% for alliance in site.data.diplomacy.nap_alliances %}
  <tr><td>{{ alliance }}</td></tr>
  {% endfor %}
</table>