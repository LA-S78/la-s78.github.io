---
layout: default
title: Rules
subtitle: Server Rules & Rotation
active_nav: rules
nav_links:
  - name: SERVER RULES
    url: "#server-rules"
  - name: ROTATION
    url: "#capitol-rotation"
  - name: REWARDS
    url: "#capitol-rewards"
dialogs:
  - dialogs/rules.html
---

{% for section in site.rules %}
  <section class="content-pane" id="{{ section.nav_id }}">
      <h2>{{ section.title }}</h2>
      {{ section.content }}
  </section>
{% endfor %}