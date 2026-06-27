---
title: "Capitol Rotation"
nav_id: "capitol-rotation"
---

{% assign p = site.data[site.active_lang].content.rules_page.rotation %}

<h1>{{ p.title }}</h1>
<p>{{ p.text }}</p>

<small style="color: var(--text-muted);">
  {{ p.note }}
</small>

<img src="/images/rotation.jpg" 
     alt="{{ p.title }}" 
     class="blueprint-img" 
     onclick="document.getElementById('rotationZoom').showModal()" 
     style="cursor: pointer; margin-top: 20px;">