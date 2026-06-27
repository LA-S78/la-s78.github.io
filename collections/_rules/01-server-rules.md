---
title: "Server Rules"
nav_id: "server-rules"
---

{% assign p = site.data[site.active_lang].content.rules_page.server_rules %}

<h1>{{ p.title }}</h1>
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