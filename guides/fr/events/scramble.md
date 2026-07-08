---
layout: guides
title: Mêlée Royale
subtitle: Mêlée Royale
active_nav: guides
guide_id: "scramble"
nav_links:
  - name_key: "scramble_event"
    url: "#event"
  - name_key: "scramble_points"
    url: "#points"
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'scramble/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}