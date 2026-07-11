---
layout: guides
title: "Война Королевств"
subtitle: "Война Королевств"
description: "Полное руководство по начислению очков и механике Войны Королевств."
active_nav: guides
guide_id: "kingdom"
nav_links:
  - name_key: "kingdom_explanation"
    url: "#explanation"
  - name_key: "kingdom_scoring"
    url: "#scoring"
  - name_key: "kingdom_strategy"
    url: "#objectives"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'kingdom/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}