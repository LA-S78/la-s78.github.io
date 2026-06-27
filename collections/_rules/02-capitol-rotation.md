---
title: "Capitol Rotation"
nav_id: "capitol-rotation"
---

{% assign strings = site.data[site.active_lang].ui.rules_page %}

{{ strings.rotation_text }}

<small style="color: var(--text-muted);">
{{ strings.rotation_note }}
</small>

<img src="/images/rotation.jpg" alt="Capitol Rotation Blueprint" class="blueprint-img" onclick="document.getElementById('rotationZoom').showModal()" style="cursor: pointer; margin-top: 20px;">