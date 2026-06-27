---
layout: guides
title: "Дуель Альянсів"
subtitle: "Дуель Альянсів"
active_nav: guides
guide_id: "duel"
nav_links:
  - name_key: "duel_schedule"
    url: "#schedule"
  - name_key: "duel_rules"
    url: "#rules"
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'duel/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}