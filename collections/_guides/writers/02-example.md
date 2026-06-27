---
title: "Markdown Example"
nav_id: "example"
---

{% assign p = site.data[site.active_lang].content.writers_page.example %}

<h2>{{ p.title }}</h2>

{% include markdown_splitview.html %}