---
title: "Capitol Rewards"
nav_id: "capitol-rewards"
---

{% assign p = site.data[site.active_lang].content.rules_page.rewards %}

<h2>{{ p.title }}</h2>

<img src="/images/rewards.jpg" 
     alt="{{ p.title }}" 
     class="blueprint-img" 
     onclick="document.getElementById('rewardsZoom').showModal()" 
     style="cursor: pointer; margin-top: 20px;">