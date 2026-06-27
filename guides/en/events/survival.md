---
layout: guides
title: Survival Battle
subtitle: Survival Battle
permalink: /guides/events/survival.html
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

<div style="background: #ff0; padding: 20px; border: 2px solid #000; margin-bottom: 20px; color: #000;">
  <h3>DEBUGGING URLS:</h3>
  <p><strong>Configured Baseurl:</strong> {{ site.baseurl }}</p>
  <p><strong>Page URL (System):</strong> {{ page.url }}</p>
  <p><strong>Generated Relative URL:</strong> {{ page.url | relative_url }}</p>
</div>

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}