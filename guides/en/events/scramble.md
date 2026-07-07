---
layout: guides
title: Royal Scramble
subtitle: Royal Scramble
active_nav: guides
guide_id: "scramble"
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'duel/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}