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

{% assign writer_sections = site.guide_index | where_exp: "item", "item.path contains 'writers/'" | sort: "path" %}

{% if writer_sections.size > 0 %}
{% for section in writer_sections %}
<section class="content-pane" id="{{ section.nav_id }}">
{{ section.content }}
</section>
{% endfor %}
{% else %}
<p>DEBUG: No writer sections found in site.guide_index.</p>
{% endif %}