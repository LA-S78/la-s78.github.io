---
title: "Server Rules"
nav_id: "server-rules"
---

The following guidelines are mandatory to ensure fair play and server stability. 

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