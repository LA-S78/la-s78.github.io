=== page--rules ===
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
strings: [capitol_rotation, rewards_planner, proposals, live_data]
---

{% for section in site.rules %}
  <section class="content-pane" id="{{ section.nav_id }}">
      {{ section.content }}
  </section>
{% endfor %}

=== collection--rules--01 ===
---
title: "Server Rules"
nav_id: "server-rules"
---

{% assign p = site.data[site.active_lang].content.rules_page.server_rules %}

<h2>{{ p.title }}</h2>
<p>{{ p.text }}</p>

<section class="duel-schedule-grid">
{% assign active_rules = site.data[site.active_lang].rules %}

{% for rule in active_rules %}
  {% if forloop.last %}
    {% include rule_card.html title=rule.title content=rule.content last="true" %}
  {% else %}
    {% include rule_card.html title=rule.title content=rule.content %}
  {% endif %}
{% endfor %}
</section>

=== collection--rules--02 ===
---
title: "Capitol Rotation"
nav_id: "capitol-rotation"
---

{% assign p = site.data[site.active_lang].content.rules_page.rotation %}

<h2>{{ p.title }}</h2>
<p>{{ p.text }}</p>

<small style="color: var(--text-muted);">
  {{ p.note }}
</small>

{% comment %} The rotation from the live calendar (js/capitol-rotation.js, /api/calendar). Until it loads, or without it: the plain rule. {% endcomment %}
<div id="rotation-board" class="rotation-board" aria-live="polite">
  <div class="rotation-grid">
    {% assign seats = "3,2,1,4" | split: "," %}
    {% for seat in seats %}
      <div class="rotation-week{% if forloop.last %} is-off-week{% endif %}">
        <div class="rotation-week-head">{% if forloop.last %}{{ "common.off_week" | t }}{% else %}{{ "common.kw_week" | t_html: "n", forloop.index }}{% endif %}</div>
        <div class="rotation-crown rank-{{ seat }}" aria-hidden="true">{% if seat == "1" %}👑{% elsif seat == "2" %}🥈{% elsif seat == "3" %}🥉{% else %}🛡️{% endif %}</div>
        <div class="rotation-seat">{{ "capitol_rotation.seat" | t_html: "rank", seat }}</div>
      </div>
    {% endfor %}
  </div>
</div>
<script type="module" src="/js/capitol-rotation.js"></script>

=== collection--rules--03 ===
---
title: "Capitol Rewards"
nav_id: "capitol-rewards"
---

{% assign p = site.data[site.active_lang].content.rules_page.rewards %}

<h2>{{ p.title }}</h2>

{% include rewards_card.html %}
