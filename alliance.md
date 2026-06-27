---
layout: default
page_key: "alliance"
active_nav: alliance
nav_links:
  - name_key: "nap_alliances"
    url: "#nap-alliances"
  - name_key: "nap_academies"
    url: "#nap-academies"
  - name_key: "nap_ranks"
    url: "#nap-ranks"
  - name_key: "nap_territory"
    url: "#nap-territory"
  - name_key: "blacklist"
    url: "#blacklist"
dialogs:
  - dialogs/alliance.html
---

{% for section in site.alliance %}
  <section class="content-pane" id="{{ section.nav_id }}">
      {{ section.content }}
  </section>
{% endfor %}