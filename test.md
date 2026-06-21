---
layout: default
title: Markdown
subtitle: Markdown Guide
---

<style>
    .split-view {
    display: flex;
    flex-direction: column; /* Stack vertically for mobile */
    gap: 10px;
    margin: 20px;
}

.view-panel {
    flex: 1; /* Both take 50% of the space */
    border: 1px solid var(--border-color);
    padding: 10px;
    border-radius: 8px;
    background: rgba(0,0,0,0.2);
}

.view-panel h3 {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--accent-color);
    margin: 0 0 10px 0;
}

.rendered-markdown {
    border-top: 1px solid var(--border-color);
    padding-top: 10px;
}

/* On wider screens (Desktops), put them side-by-side */
@media (min-width: 600px) {
    .split-view { flex-direction: row; }
}
</style>

## Markdown Usage

"##"    = large title

"####"  = small title

"** **" = bold text

"*"     = bullet point

">"     = text block/bubble

<div class="split-view">
  <div class="view-panel">
    <h3>Markdown Source</h3>
    <pre><code>## 1. Progression Strategy 

Racing to Sanctuary Level 30 is the primary goal for long-term account strength, but rushing without planning causes "bottlenecks."

> #### ⚠️ Priority Intel
> 
> **Never start an upgrade without checking your prerequisites first.** You don't want to save 2 days of resources only to realize you forgot to level up the Laboratory or Training Grounds.

The progression shifts around Level 20. Before 20, progress is straightforward. After 20, you must prioritize the specific "Required Buildings" list, as these will become your primary time-sinks.

## 2. Level Prerequisites Chart

Use the chart below to plan your construction queue. This covers resource costs and specific structure requirements to prevent construction halts.

(put chart here)

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

  <div class="view-panel">
    <h3>Rendered Result</h3>
    <div class="rendered-markdown">
      <h2>1. Progression Strategy</h2>
      <p>Racing to Sanctuary Level 30 is the primary goal for long-term account strength, but rushing without planning causes "bottlenecks."</p>

      <blockquote>
        <h4>⚠️ Priority Intel</h4>
        <p><strong>Never start an upgrade without checking your prerequisites first.</strong> You don't want to save 2 days of resources only to realize you forgot to level up the Laboratory or Training Grounds.</p>
      </blockquote>

      <p>The progression shifts around Level 20. Before 20, progress is straightforward. After 20, you must prioritize the specific "Required Buildings" list, as these will become your primary time-sinks.</p>

      <h2>2. Level Prerequisites Chart</h2>
      <p>Use the chart below to plan your construction queue. This covers resource costs and specific structure requirements to prevent construction halts.</p>

      <p>(put chart here)</p>

      <h2>3. Building Ceiling Goals</h2>
      <p>Once you reach these levels, you have satisfied all prerequisite requirements for Sanctuary 30. You can deprioritize these buildings and reallocate your resources toward troops and tech.</p>

      <ul>
        <li><strong>Laboratory:</strong> Level 30</li>
        <li><strong>Training Grounds:</strong> Level 30</li>
        <li><strong>Command Center:</strong> Level 30</li>
        <li><strong>Wall:</strong> Level 30</li>
        <li><strong>Warehouse:</strong> Level 25 (Efficiency Cap)</li>
        <li><strong>Resource Buildings:</strong> Level 25 (Maintenance Cap)</li>
      </ul>

      <h2>4. Efficiency & Spending</h2>
      <p>The transition from Level 25 to 30 represents the steepest climb in the game. To maintain momentum:</p>
      <ul>
        <li><strong>Construction Speed:</strong> Ensure your "Building Speed" research is maxed out in the Laboratory.</li>
        <li><strong>Alignment:</strong> Align your major building upgrades with the "Alliance Duel" event.</li>
        <li><strong>Titles:</strong> Make sure to utilise Minister of Construction or Chief of Affairs.</li>
      </ul>
    </div>
  </div>
</div>