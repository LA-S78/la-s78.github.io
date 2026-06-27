---
layout: guides
title: "Bataille de Survie"
subtitle: "Bataille de Survie"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}