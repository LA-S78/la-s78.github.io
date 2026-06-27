---
title: "Markdown Usage"
nav_id: "usage"
---

{% assign p = site.data[site.active_lang].content.writers_page.usage %}

<h2>{{ p.title }}</h2>
<p>{{ p.text | markdownify }}</p>
