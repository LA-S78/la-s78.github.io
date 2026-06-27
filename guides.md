---
layout: default
page_key: "guides"
subtitle: Game Guides
active_nav: guides
---

{% include structure/search.html search_type="guides" %}

{% assign main_guides = site.guides | where_exp: "item", "item.relative_path contains 'writers/' == false" %}

{% for section in site.guides %}
<section class="content-pane" id="{{ section.nav_id }}">
  {{ section.content }}
</section>
{% endfor %}