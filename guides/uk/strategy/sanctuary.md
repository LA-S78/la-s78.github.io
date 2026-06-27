---
layout: guides
title: "Гайд по Святилищу"
subtitle: "Посібник з прокачування"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}