---
layout: default
title: Markdown
subtitle: Markdown Guide
---

<style>
    .split-view {
        display: flex;
        flex-direction: column;
        gap: 15px;
        margin: 20px 0;
    }

    .view-panel {
        flex: 1;
        border: 1px solid var(--border-color);
        padding: 15px;
        border-radius: 8px;
        background: rgba(0,0,0,0.05);
        transition: all 0.3s ease;
    }

    .view-panel h3 {
        margin-top: 0;
        font-size: 0.8rem;
        text-transform: uppercase;
        color: var(--accent-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .view-panel button {
        cursor: pointer;
        font-size: 0.65rem;
        padding: 2px 8px;
        background: var(--accent-color);
        color: white;
        border: none;
        border-radius: 4px;
    }

    pre {
        background: rgba(0, 0, 0, 0.3);
        padding: 15px;
        border-radius: 6px;
        overflow-x: auto;
        white-space: pre-wrap;
        font-family: monospace;
        font-size: 0.85rem;
    }

    /* Expansion Logic */
    .view-panel.full-width { flex: 0 0 100% !important; order: -1; }
    .split-view.has-expanded .view-panel:not(.full-width) { display: none; }

    @media (min-width: 768px) {
        .split-view { flex-direction: row; }
    }
</style>

## Markdown Usage

* `##`    = Large Title
* `####`  = Small Title
* `**`    = Bold Text
* `*`     = Bullet Point
* `>`     = Text Block/Bubble

<div class="split-view" id="markdown-container">
  
  <div class="view-panel" id="panel-source">
    <h3>Markdown Source <button onclick="expandPanel('panel-source')">Expand</button></h3>
    <pre><code>## 1. Progression Strategy 

Racing to Sanctuary Level 30 is the primary goal for long-term account strength, but rushing without planning causes "bottlenecks."

> #### ⚠️ Priority Intel
> 
> **Never start an upgrade without checking your prerequisites first.** You don't want to save 2 days of resources only to realize you forgot to level up the Laboratory or Training Grounds.

The progression shifts around Level 20. Before 20, progress is straightforward. After 20, you must prioritize the specific "Required Buildings" list, as these will become your primary time-sinks.

## 2. Level Prerequisites Chart

Use the chart below to plan your construction queue. This covers resource costs and specific structure requirements to prevent construction halts.

| Sanctuary Lvl | Key Prerequisite Building | Purpose |
| :--- | :--- | :--- |
| **20-22** | Laboratory | Tech Speed |
| **23-25** | Training Grounds | Troop Capacity |
| **26-28** | Command Center | Rally/March Size |
| **29-30** | Resource Silos | Storage Capacity |

## 3. Building Ceiling Goals

Once you reach these levels, you have satisfied all prerequisite requirements for Sanctuary 30. You can deprioritize these buildings and reallocate your resources toward troops and tech.

* **Laboratory:** Level 30
* **Training Grounds:** Level 30
* **Command Center:** Level 30
* **Wall:** Level 30
* **Warehouse:** Level 25 (Efficiency Cap)
* **Resource Buildings:** Level 25 (Maintenance Cap)

## 4. Efficiency & Spending

The transition from Level 25 to 30 represents the steepest climb in the game. To maintain momentum:

* **Construction Speed:** Ensure your "Building Speed" research is maxed out in the Laboratory. This provides a compounding bonus that saves weeks of time by Level 30.
* **Alignment:** Align your major building upgrades with the "Alliance Duel" event whenever possible to gain points for your efforts.
* **Titles:** Make sure to utilise Minister of Construction or Chief of Affairs before starting construction. These buffs can dramatically reduce construction times.</code></pre>
  </div>

  <div class="view-panel" id="panel-result">
    <h3>Rendered Result <button onclick="expandPanel('panel-result')">Expand</button></h3>
    <div class="rendered-markdown">
      <h2>1. Progression Strategy</h2>
      <p>Racing to Sanctuary Level 30 is the primary goal for long-term account strength, but rushing without planning causes "bottlenecks."</p>
      <blockquote>
        <h4>⚠️ Priority Intel</h4>
        <p><strong>Never start an upgrade without checking your prerequisites first.</strong></p>
      </blockquote>
      <p>The progression shifts around Level 20. After 20, you must prioritize the specific "Required Buildings" list.</p>
      <h2>2. Level Prerequisites Chart</h2>
      <table>
        <tr><th>Sanctuary Lvl</th><th>Prerequisite</th><th>Purpose</th></tr>
        <tr><td>20-22</td><td>Laboratory</td><td>Tech Speed</td></tr>
      </table>
      <h2>3. Building Ceiling Goals</h2>
      <ul>
        <li><strong>Laboratory:</strong> Level 30</li>
        <li><strong>Training Grounds:</strong> Level 30</li>
      </ul>
      <h2>4. Efficiency & Spending</h2>
      <ul>
        <li><strong>Construction Speed:</strong> Max out in Laboratory.</li>
        <li><strong>Titles:</strong> Use Minister of Construction.</li>
      </ul>
    </div>
  </div>
</div>

<script>
function expandPanel(panelId) {
    const container = document.getElementById('markdown-container');
    const panel = document.getElementById(panelId);
    panel.classList.toggle('full-width');
    container.classList.toggle('has-expanded');
    const btn = panel.querySelector('button');
    btn.textContent = panel.classList.contains('full-width') ? 'Collapse' : 'Expand';
}
</script>