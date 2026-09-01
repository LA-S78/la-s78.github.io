=== page--guide_index ===
---
layout: default
page_key: "guides"
subtitle: Game Guides
active_nav: guides
permalink: /guides/index.html
---

{% include structure/search.html search_type="guides" %}

{% for section in site.guide_index %}
{% unless section.relative_path contains 'writers' or section.nav_id == 'writers' %}
<section class="content-pane" id="{{ section.nav_id }}">
{{ section.content }}
</section>
{% endunless %}
{% endfor %}

=== collection--guide_index--01 ===
---
title: "Game Strategy"
nav_id: "game-strategy"
---

{% assign p = site.data[site.active_lang].content.guides_page.strategy %}

<h2>{{ p.title }}</h2>

{% include guide_grid.html category="strategy" %}

=== collection--guide_index--02 ===
---
title: "Game Events"
nav_id: "game-events"
---

{% assign p = site.data[site.active_lang].content.guides_page.events %}

<h2>{{ p.title }}</h2>

{% include guide_grid.html category="events" %}

=== collection--guide_index--03 ===
---
title: "Economy & Shops"
nav_id: "economy-shops"
---

{% assign p = site.data[site.active_lang].content.guides_page.shops %}

<h2>{{ p.title }}</h2>

{% include guide_grid.html category="shops" %}

=== collection--guide_index--04 ===
---
title: "Guide Authors"
nav_id: "authors"
---

{% assign p = site.data[site.active_lang].content.guides_page.writers %}

<h2>{{ p.title }}</h2>
<p>
  {{ p.text }}
  <a href="/{{ site.active_lang }}{{ p.link_url }}">{{ p.text2 }}</a>
</p>
