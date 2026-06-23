---
title: "NAP Academies"
nav_id: "nap-academies"
---

<table class="list-table">
  {% for academy in site.data.diplomacy.nap_academies %}
  <tr>
    <td>
      <strong>{{ academy.name }}</strong>
      <span class="sub-text">Academy of {{ academy.parent }}</span>
    </td>
  </tr>
  {% endfor %}
</table>