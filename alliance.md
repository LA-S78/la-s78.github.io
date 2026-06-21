---
layout: default
title: Alliance
subtitle: Alliance & Diplomacy
active_nav: alliance
nav_links:
  - name: NAP ALLIANCES
    url: "#nap-alliances"
  - name: NAP ACADEMIES
    url: "#nap-academies"
  - name: NAP RANKS
    url: "#nap-ranks"
  - name: NAP TERRITORY
    url: "#nap-territory"
  - name: BLACKLIST
    url: "#blacklist"
dialogs:
  - dialogs/alliance.html
---

## NAP Alliances {#nap-alliances}

{% include diplomacy_layout.html type="alliances" %}

## NAP Academies {#nap-academies}

{% include diplomacy_layout.html type="academies" %}

## NAP Ranks {#nap-ranks}

The current Top 4 alliance hierarchy within the NAP:

{% include diplomacy_layout.html type="ranks" %}

## NAP Territory {#nap-territory}

<img src="/images/map.jpg" alt="NAP Territory Map" class="blueprint-img" onclick="document.getElementById('mapZoom').showModal()" style="cursor: pointer;">

## Blacklist {#blacklist}

The following players are banned from NAP alliances and are kill-on-sight:

{% include diplomacy_layout.html type="blacklist_players" %}

The following alliances are kill-on-sight:

{% include diplomacy_layout.html type="blacklist_alliances" %}