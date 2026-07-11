---
layout: guides
title: "Peynir Tuzağı"
subtitle: "Peynir Tuzağı"
active_nav: guides
guide_id: "cheese"
nav_links:
  - name_key: "cheese_event"
    url: "#event"
  - name_key: "cheese_cheese"
    url: "#cheese"
  - name_key: "cheese_strategy"
    url: "#strategy"
  - name_key: "cheese_rewards"
    url: "#rewards"
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'cheese/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}