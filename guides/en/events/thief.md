---
layout: guides
title: Thief Hunt
subtitle: Thief Hunt
active_nav: guides
guide_id: "thief"
nav_links:
  - name_key: "thief_explanation"
    url: "#explanation"
  - name_key: "thief_coins"
    url: "#coins"
  - name_key: "thief_shop"
    url: "#shop"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'thief/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}