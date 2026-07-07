---
layout: guides
title: Royal Scramble
subtitle: Royal Scramble
active_nav: guides
guide_id: "scramble"
nav_links:
  - name_key: "Scramble"
    url: "#event"
  - name_key: "Points"
    url: "#points"
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'scramble/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}