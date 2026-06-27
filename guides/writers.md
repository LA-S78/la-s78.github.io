---
layout: default
title: Markdown
subtitle: Markdown Guide
active_nav: guides
nav_links:
  - name_key: "markdown_usage"
    url: "#usage"
  - name_key: "markdown_example"
    url: "#example"
  - name_key: "guide_submissions"
    url: "#submissions"
---

{% assign writer_sections = site.guides | where_exp: "item", "item.relative_path contains 'writers/'" %}

{% assign writer_sections = writer_sections | sort: "relative_path" %}

{% for section in writer_sections %}
  {% comment %} 3. Added your section wrapper back so your nav_links (#usage) actually work! {% endcomment %}
  <section class="content-pane" id="{{ section.nav_id }}">
    {{ section.content }}
  </section>
{% endfor %}