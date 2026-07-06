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