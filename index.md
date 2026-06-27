---
layout: default
page_key: "home"
subtitle: Survival Compendium
active_nav: home
---

{% include structure/search_hero.html placeholder="Search directories, posts..." %}

{% for section in site.home %}
<section class="content-pane" id="{{ section.nav_id }}">
  <h2>{{ section.title }}</h2>
  {{ section.content }}
</section>
{% endfor %}