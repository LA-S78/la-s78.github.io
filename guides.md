---
layout: default
page_key: "guides"
subtitle: Game Guides
active_nav: guides
---

{% include structure/search.html search_type="guides" %}

{% for section in site.guides %}
<section class="content-pane" id="{{ section.nav_id }}">
  {{ section.content }}
</section>
{% endfor %}