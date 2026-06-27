---
layout: default
page_key: "rules"
active_nav: rules
nav_links:
  - name_key: "server_rules"
    url: "#server-rules"
  - name_key: "rotation"
    url: "#capitol-rotation"
  - name_key: "rewards"
    url: "#capitol-rewards"
dialogs:
  - dialogs/rules.html
---

{% for section in site.rules %}
  <section class="content-pane" id="{{ section.nav_id }}">
      {{ section.content }}
  </section>
{% endfor %}