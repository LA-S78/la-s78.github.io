---
layout: default
page_key: "guides"
subtitle: Game Guides
active_nav: guides
---

{% include structure/search.html search_type="guides" %}

{% for section in site.guides %}
{% unless section.relative_path contains 'writers/' %}
<section class="content-pane" id="{{ section.nav_id }}">
{{ section.content }}
</section>
{% endunless %}
{% endfor %}