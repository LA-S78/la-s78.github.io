=== page--guides/writers ===
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

=== page--collections/_guide_index/04-writers ===
---
title: "Guide Authors"
nav_id: "authors"
---

{% assign p = site.data[site.active_lang].content.guides_page.writers %}

<h2>{{ p.title }}</h2>
<p>
  {{ p.text }}
  <a href="/{{ site.active_lang }}{{ p.link_url }}">{{ p.text2 }}</a>
</p>

=== page--collections/_guide_index/writers/01-usage ===
---
title: "Markdown Usage"
nav_id: "usage"
---

{% assign p = site.data[site.active_lang].content.writers_page.usage %}

<h2>{{ p.title }}</h2>
<p>{{ p.text | markdownify }}</p>

=== page--collections/_guide_index/writers/02-example ===
---
title: "Markdown Example"
nav_id: "example"
---

{% assign p = site.data[site.active_lang].content.writers_page.example %}

<h2>{{ p.title }}</h2>

{% include markdown_splitview.html %}

=== page--collections/_guide_index/writers/03-submissions ===
---
title: "Guide Submissions"
nav_id: "submissions"
---

{% assign p = site.data[site.active_lang].content.writers_page.submissions %}

<h2>{{ p.title }}</h2>
<p>{{ p.text }}</p>
