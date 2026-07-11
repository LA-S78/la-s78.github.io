---
layout: guides
title: "Guerra de Reinos"
subtitle: "Guerra de Reinos"
description: "Una guía completa sobre la puntuación y mecánica de las Guerras de Reinos."
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