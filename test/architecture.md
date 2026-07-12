---
layout: default
title: "Architecture"
permalink: /architecture.html
---

<div class="content-pane">
  <h2>System Blueprint</h2>
  
  <pre class="mermaid">
    flowchart TD
    %% ===========================================================
    %% 1. Source Infrastructure
    %% ===========================================================
    subgraph Input_Phase [1. Source Infrastructure]
        A1[" _source/ Folder<br>(Markdown Master Files) "]
        A2[" Site Infrastructure<br>(_layouts, CSS/JS Source) "]
    end

    %% ===========================================================
    %% 2 & 3. Pipeline Automation (With Nested File Tree)
    %% ===========================================================
    subgraph Script_Engine [2. Pipeline Automation]
        B[" AI Translation Sensor<br>(generate_master.rb) "]
        C[" Format-Agnostic Segregation<br>(Dividing Engine) "]
        
        subgraph Asset_Tree [3. Generated Jekyll File Tree]
            E1[" Root Pages<br>(index.md, rules.md) "]
            E2[" Standard Collections<br>(_alliance, _rules) "]
            E3[" Regional Guides & Panes<br>(guides, panes) "]
        end
        
        D[" UI Translation Sync<br>(sync_ui_data.rb) "]
    end

    %% ===========================================================
    %% 4. Compilation Loop
    %% ===========================================================
    subgraph Compilation_Loop [4. Sequential Builds]
        F[" Jekyll Build Engine<br>(Merges content & layouts) "]
        G[" Step 1: Primary Build<br>(Generates Root English Site) "]
        H[" Step 2: Regional Loop<br>(Iterates Language Configs) "]
        I[" Step 3: Localized Trees<br>(Generates /de, /es, /fr) "]
    end

    %% ===========================================================
    %% 5. Post-Build Assembly
    %% ===========================================================
    subgraph Post_Processing [5. Post-Build Assembly]
        J1[" Step 4: Asset Injection<br>(Copies css, js, images) "]
        J2[" Step 5: Runtime Patching<br>(dev-url-fixer) "]
        J3[" Step 6: Workbox Precache<br>(sw.js cache hashes) "]
        J4[" Step 7: API Payload<br>(Copies /api/ directory) "]
    end

    %% ===========================================================
    %% 6. Cloud Deployments
    %% ===========================================================
    subgraph Cloud_Hosting [6. Cloud Deployments]
        K[" Final Distribution Matrix<br>(_site/) "]
        M{" Git Branch Check "}
        N[" Vercel Production<br>(la-s78.app) "]
        O[" Vercel Preview<br>(dev.la-s78.app) "]
        P[" GitHub Pages Fallback<br>(gh-pages) "]
    end

    %% Connections
    A1 <--> B
    A1 --> C
    C --> E1 & E2 & E3
    E1 & E2 & E3 --> D
    D --> F
    A2 --> F
    F --> G --> H --> I
    I --> J1 --> J2 --> J3 --> J4
    J4 --> K --> M --> N & O & P

    %% Classes (Original Block Colors)
    classDef source fill:#2c221d,stroke:#e6a050,stroke-width:2px,color:#fff;
    classDef script fill:#1e2522,stroke:#23782d,stroke-width:2px,color:#fff;
    classDef jekyll fill:#3b2a3a,stroke:#8c32b4,stroke-width:2px,color:#fff;
    classDef asset fill:#1a2332,stroke:#3278b4,stroke-width:2px,color:#fff;
    classDef deploy fill:#111,stroke:#fff,stroke-width:2px,color:#fff;

    class A1,A2 source;
    class B,C,D,J2,J3 script;
    class F,G,H,I jekyll;
    class E1,E2,E3,J1,J4 asset;
    class K,M,N,O,P deploy;
  </pre>
</div>

<script src="/js/mermaid.min.js"></script>

<script>
  // Get CSS variables directly from the browser
  const style = getComputedStyle(document.documentElement);
  
  mermaid.initialize({ 
    startOnLoad: true, 
    theme: 'base',
    
    // The modern layout engine configs
    flowchart: {
      padding: 10,         // Increases outer margin of subgraphs
      rankSpacing: 80      // Physically pushes internal nodes further down, making room for your larger headers
    },

    themeVariables: {
      primaryColor: style.getPropertyValue('--card-bg').trim(),
      primaryTextColor: style.getPropertyValue('--accent-color').trim(),
      clusterBkg: style.getPropertyValue('--card-bg').trim(),
      clusterBorder: style.getPropertyValue('--accent-color').trim(),
      titleColor: style.getPropertyValue('--accent-color').trim()
    },
    securityLevel: 'loose'
  });
</script>

<style>
  /* Use native site variables */
  .mermaid .cluster rect {
    stroke-width: 2px !important;
  }
  .mermaid path {
    stroke: rgba(var(--active-theme-bright), 0.6) !important;
    stroke-width: 2px !important;
  }
  .mermaid .nodeLabel,
  .mermaid .nodeLabel tspan,
  .mermaid .node text,
  .mermaid .node tspan {
    font-family: var(--font-body) !important;
  }
  .mermaid .edgeLabel,
  .mermaid .edgeLabel tspan,
  .mermaid .cluster-label,
  .mermaid .cluster-label tspan {
    font-family: var(--font-headers) !important;
    font-size: 1.25rem !important;
    line-height: 2.5rem !important;
    font-weight: bold !important;
    /* flowchart uses HTML divs for labels, so we define 'color' alongside 'fill' */
    color: var(--accent-color) !important; 
    fill: var(--accent-color) !important;
  }
</style>