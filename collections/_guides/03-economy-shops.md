---
title: "Economy & Shops"
nav_id: "economy-shops"
---

{% assign p = site.data[site.active_lang].content.guides_page.shops %}

<h2>{{ p.title }}</h2>

{% include guide_grid.html category="shops" %}