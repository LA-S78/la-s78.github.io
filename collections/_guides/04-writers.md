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

Guide authors are needed! Click [here!](/guides/writers.html)