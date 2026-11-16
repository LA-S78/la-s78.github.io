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
strings: [rewards_planner, proposals, live_data]
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

{% comment %} The rotation itself is on the calendar (its Capitol console), which shows every week's alliance and the active week; a board here repeated it (removed 2026-11-16, owner). {% endcomment %}
<p class="rotation-link"><a href="/{{ site.active_lang }}/calendar.html#operations-portal">{{ "capitol_rotation.calendar_link" | t }}</a></p>

=== collection--rules--03 ===
---
title: "Capitol Rewards"
nav_id: "capitol-rewards"
---

{% assign p = site.data[site.active_lang].content.rules_page.rewards %}

<h2>{{ p.title }}</h2>

{% include rewards_card.html %}
