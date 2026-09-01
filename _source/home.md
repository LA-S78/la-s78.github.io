=== page--index ===
---
layout: default
page_key: "home"
subtitle: Survival Compendium
active_nav: home
---

{% include structure/search.html search_type="home" %}

{% for section in site.home %}
<section class="content-pane" id="{{ section.nav_id }}">
  {{ section.content }}
</section>
{% endfor %}

{% include credits.html %}

=== collection--home--01 ===
---
title: "Critical Intel"
nav_id: "critical-intel"
---

{% assign p = site.data[site.active_lang].content.home_page.pinned %}

<h2>{{ p.title }}</h2>

{% include home_pinned.html %}

=== collection--home--02 ===
---
title: "Directories"
nav_id: "directories"
---

{% assign p = site.data[site.active_lang].content.home_page.directories %}

<h2>{{ p.title }}</h2>

{% include home_directories.html %}