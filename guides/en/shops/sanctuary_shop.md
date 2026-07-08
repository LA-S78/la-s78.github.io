---
layout: guides
title: "Sanctuary Shop"
subtitle: "Sanctuary Shop"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}