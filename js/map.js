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
      const regions = document.querySelectorAll('#game-map path');

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