---
layout: default
page_key: "map"
permalink: /map/
lang: "en"
---
<section class="content-pane">

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Last Asylum — War Room Atlas</title>
  <style>
    /* Theme Fallbacks & Base Styling */
    :root {
      --card-bg: #1a1a1a;
      --accent-color: #b8975a;
      --border-color: #333333;
      --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    body {
      background-color: #111;
      color: #eee;
      font-family: var(--font-body);
      padding: 20px;
    }

    /* Map Layout Container */
    #map-container {
      position: relative;
      max-width: 960px;
      margin: 0 auto;
      background: #0d0d0d;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 15px;
    }

    /* SVG Map Styling */
    #game-map {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Ensure SVG text elements don't block path hover/clicks */
    #game-map text {
      pointer-events: none;
      user-select: none;
      fill: #ffffff;
      font-size: 12px;
      font-weight: bold;
      text-anchor: middle;
    }

    /* Interactive Path Styling */
    .map-territory {
      cursor: pointer;
      transition: fill 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease;
      /* Optional baseline fill override if not colored directly in SVG */
      stroke: rgba(0, 0, 0, 0.5);
      stroke-width: 1.5px;
    }

    .map-territory:hover {
      stroke: var(--accent-color) !important;
      stroke-width: 3px !important;
      filter: brightness(1.25);
    }

    .map-territory.selected {
      stroke: #ffffff !important;
      stroke-width: 4px !important;
      filter: brightness(1.4);
    }

    /* Hover Tooltip Overlay */
    #map-tooltip {
      display: none;
      position: absolute;
      padding: 8px 12px;
      background: var(--card-bg);
      border: 1px solid var(--accent-color);
      color: #fff;
      border-radius: 4px;
      pointer-events: none;
      font-size: 0.85rem;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    /* Bottom Intel Panel */
    #territory-intel-pane {
      margin-top: 15px;
      padding: 15px 20px;
      background: var(--card-bg);
      border-left: 4px solid var(--accent-color);
      border-radius: 0 4px 4px 0;
      color: #fff;
    }

    #intel-title {
      margin: 0 0 8px 0;
      font-size: 1.2rem;
      color: var(--accent-color);
    }

    #intel-body {
      margin: 0;
      color: #ccc;
      line-height: 1.5;
    }
  </style>
</head>
<body>

  <div id="map-container">
    <!-- 1. Scout Hover Tooltip -->
    <div id="map-tooltip"></div>

    {% include map.svg %}

    <!-- 3. Selected Territory Command Intel Pane -->
  <div id="territory-intel-pane">
      <h3 id="intel-title">Select a Territory</h3>
      <p id="intel-body">Click any region on the map above to view garrison rules, active buffs, and SSoT metadata.</p>
  </div>
  </div>

</section>
<script>
    // A. Single Source of Truth (SSoT) Mock Dictionary
    // Keys match the slugified SVG `id` attributes
    window.TERRITORY_DATA = {
      "capitol": {
        name: "The Capitol",
        tier: "Gold I",
        buff: "+15% Might Bonus, +10% Gathering Speed",
        owner: "[SICK] Plague Bearers"
      },
      "inner_red_north": {
        name: "Northern Red Hub",
        tier: "Silver III",
        buff: "+10% Troop Attack",
        owner: "[VAL] Valhalla"
      },
      "inner_red_south": {
        name: "Southern Red Hub",
        tier: "Silver III",
        buff: "+10% Troop Defense",
        owner: "[APEX] Apex Vanguard"
      },
      "mid_purple_east": {
        name: "Eastern Purple Outpost",
        tier: "Silver I",
        buff: "+5% March Speed",
        owner: "Unclaimed"
      },
      "mid_purple_west": {
        name: "Western Purple Outpost",
        tier: "Silver I",
        buff: "+5% Construction Speed",
        owner: "Unclaimed"
      },
      "outer_green_nw": {
        name: "Northwest Outer Sector",
        tier: "Bronze II",
        buff: "+3% Gathering Speed",
        owner: "Neutral"
      }
    };

    // Helper: Turns any string into a clean YAML/JS dictionary key
    const slugify = text => text.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '');

    document.addEventListener("DOMContentLoaded", () => {
      const mapContainer = document.getElementById("map-container");
      const tooltip = document.getElementById("map-tooltip");
      const intelTitle = document.getElementById("intel-title");
      const intelBody = document.getElementById("intel-body");

      // Query all territory paths
      const regions = document.querySelectorAll('.map-territory');

      regions.forEach(region => {
        // Read SVG ID directly
        const rawId = region.id;
        if (!rawId) return;

        const key = slugify(rawId);
        
        // Fetch matching SSoT data or fallback to defaults
        const data = window.TERRITORY_DATA[key] || { 
          name: rawId, 
          tier: "Unassigned Tier", 
          buff: "No specific buff data linked yet.", 
          owner: "Neutral" 
        };

        // 1. HOVER EVENT (Scout Tooltip)
        region.addEventListener("mouseenter", () => {
          tooltip.style.display = "block";
          tooltip.innerHTML = `<strong>${data.name}</strong><br><small>${data.tier} • ${data.owner}</small>`;
        });

        region.addEventListener("mousemove", (e) => {
          const containerRect = mapContainer.getBoundingClientRect();
          // Position relative to #map-container offset
          tooltip.style.left = (e.clientX - containerRect.left + 15) + "px";
          tooltip.style.top = (e.clientY - containerRect.top + 15) + "px";
        });

        region.addEventListener("mouseleave", () => {
          tooltip.style.display = "none";
        });

        // 2. CLICK EVENT (Command Intel Pane)
        region.addEventListener("click", () => {
          intelTitle.textContent = `${data.name} (${data.tier})`;
          intelBody.innerHTML = `
            <strong>Controlling Alliance:</strong> ${data.owner}<br>
            <strong>Active Buffs:</strong> ${data.buff}<br>
            <small style="color: #666;">SVG Target ID: <code>${rawId}</code> | SSoT Key: <code>${key}</code></small>
          `;

          // Clear previous selection highlight and set new one
          regions.forEach(r => r.classList.remove('selected'));
          region.classList.add('selected');
        });
      });
    });
  </script>