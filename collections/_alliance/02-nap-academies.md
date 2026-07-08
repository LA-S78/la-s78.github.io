---
title: "NAP Academies"
nav_id: "nap-academies"
---

{% assign p = site.data[site.active_lang].content.alliance_page.nap_academies %}

<h2>{{ p.title }}</h2>

<table class="list-table" id="nap-alliance-table">
  {% for academy in site.data.diplomacy.nap_academies %}
  <tr>
    <td>
      <strong>{{ academy.name }}</strong>
      <span class="sub-text">{{ p.text }}{{ academy.parent }}</span>
    </td>
  </tr>
  {% endfor %}
</table>