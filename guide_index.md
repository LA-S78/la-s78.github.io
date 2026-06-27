---
layout: default
page_key: "guides"
subtitle: Game Guides
active_nav: guides
permalink: /guides/index.html
---

{% include structure/search.html search_type="guides" %}

{% for section in site.guide_index %}
{% unless section.relative_path contains 'writers/' %}
<section class="content-pane" id="{{ section.nav_id }}">
{{ section.content }}
</section>
{% endunless %}
{% endfor %}