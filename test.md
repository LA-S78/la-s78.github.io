---
layout: default
title: Kingdom War
subtitle: Kingdom War
description: A comprehensive guide to Kingdom Wars scoring and mechanics.
active_nav: guides
nav_links:
  - name: EXPLANATION
    url: "#explanation"
  - name: SCORING
    url: "#scoring"
  - name: STRATEGY
    url: "#strategy"
---

## 1. Event Explanation

Kingdom Wars is a three-week event between the servers in a cluster. During these weeks, you will be paired against another server and compete for points for the week.

The winner of that week will earn invasion rights against their opponent's server to attempt and take their castle during the event on Saturday. The fight begins at **12:00 PM server time**, and continues until either side reaches 100% occupation.

## 2. Points Scoring

<table class="list-table table-spaced">
    <tbody>
        {% for item in site.data.kingdom_points %}
        <tr class="{{ item.category }}">
            <td>{{ item.task }}</td>
            <td class="points-value">{{ item.points }}</td>
        </tr>
        {% endfor %}
    </tbody>
</table>

## 3. Strategic Focus

> #### ⚠️ Important Objectives
> * It is critical that you use **all 10 chances** you have against the Demon King each day.
> * **Only target caravans** from the server you are up against for that specific week.
> * Save your items for the correct duel days listed in the Alliance Duel guide, and time up as much as you can of those days with your Survival Battles.