---
layout: default
title: "Architecture"
permalink: /architecture.html
---

<div class="content-pane" style="padding: 20px; text-align: center;">
  <h2>System Blueprint</h2>
  <p>A live look at the automated SSoT compilation pipeline.</p>

  <pre class="mermaid" style="background-color: transparent; border: none;">
graph TD
    A1 --> B
    B --> A1
    A1 --> C
    C --> E1
    C --> E2
    C --> E3
    E1 --> D
    E2 --> D
    E3 --> D
    D --> F
    A2 --> F
    F --> G
    G --> H
    H --> I
    I --> J1
    J1 --> J2
    J2 --> J3
    J3 --> J4
    J4 --> K
    K --> M
    M --> N
    M --> O
    M --> P

    subgraph Input_Phase ["<span style='color:#e6a050;font-weight:bold;font-size:14px;'>1. Source Infrastructure</span>"]
        A1[" _source/ Folder<br>(Markdown Master Files) "]
        A2[" Site Infrastructure<br>(_layouts, _includes,<br>_data, CSS/JS Source) "]
    end

    subgraph Script_Engine ["<span style='color:#e6a050;font-weight:bold;font-size:14px;'>2. Pipeline Automation</span>"]
        B[" AI Translation<br>Sensor<br>(generate_master.rb) "]
        C[" Format-Agnostic<br>Segregation<br>(Dividing Engine) "]
        D[" UI Translation<br>Sync<br>(sync_ui_data.rb) "]
    end

    subgraph Asset_Tree ["<span style='color:#e6a050;font-weight:bold;font-size:14px;'>3. Jekyll File Tree</span>"]
        E1[" Root Pages<br>(index.md, rules.md) "]
        E2[" Standard<br>Collections<br>(_alliance, _rules) "]
        E3[" Regional Guides<br>& Panes<br>(guides, panes) "]
    end

    subgraph Compilation_Loop ["<span style='color:#e6a050;font-weight:bold;font-size:14px;'>4. Sequential Builds</span>"]
        F[" Jekyll Build Engine<br>(Merges content & layouts) "]
        G[" Step 1: Primary Build<br>(Generates Root<br>English Site) "]
        H[" Step 2: Regional Loop<br>(Iterates Language Configs) "]
        I[" Step 3: Localized Trees<br>(Generates /de/, /es/, /fr/) "]
    end

    subgraph Post_Processing ["<span style='color:#e6a050;font-weight:bold;font-size:14px;'>5. Post-Build Assembly</span>"]
        J1[" Step 4: Asset Injection<br>(Copies css, js, images,<br>manifest, redirect.html) "]
        J2[" Step 5: Runtime Patching<br>(Injects dev-url-fixer<br>into main.js) "]
        J3[" Step 6: Workbox Precache<br>(Sweeps assets & generates<br>sw.js cache hashes) "]
        J4[" Step 7: API Payload<br>(Copies /api/ directory) "]
    end

    subgraph Cloud_Hosting ["<span style='color:#e6a050;font-weight:bold;font-size:14px;'>6. Cloud Deployments</span>"]
        K[" Final Distribution<br>Matrix (_site/) "]
        M{" Git Branch<br>Check "}
        N[" Vercel Production<br>(la-s78.app) "]
        O[" Vercel Preview<br>(dev.la-s78.app) "]
        P[" GitHub Pages<br>Fallback<br>(gh-pages) "]
    end

    classDef source fill:#2c221d,stroke:#e6a050,stroke-width:2px,color:#fff;
    classDef script fill:#1e2522,stroke:#23782d,stroke-width:2px,color:#fff;
    classDef jekyll fill:#3b2a3a,stroke:#8c32b4,stroke-width:2px,color:#fff;
    classDef asset fill:#1a2332,stroke:#3278b4,stroke-width:2px,color:#fff;
    classDef deploy fill:#111,stroke:#fff,stroke-width:2px,color:#fff;

    class A1 source;
    class A2,E1,E2,E3,J1,J4 asset;
    class B,C,D,J2,J3 script;
    class F,G,H,I jekyll;
    class K,L,M,N,O,P deploy;

    style Input_Phase fill:#1a1513,stroke:#4a3b32,stroke-width:1px,color:#e6a050;
    style Script_Engine fill:#131715,stroke:#2d4232,stroke-width:1px,color:#e6a050;
    style Asset_Tree fill:#13171a,stroke:#2d3a42,stroke-width:1px,color:#e6a050;
    style Compilation_Loop fill:#19141a,stroke:#3b2d42,stroke-width:1px,color:#e6a050;
    style Post_Processing fill:#14171a,stroke:#2d3a42,stroke-width:1px,color:#e6a050;
    style Cloud_Hosting fill:#111111,stroke:#444444,stroke-width:1px,color:#e6a050;

    linkStyle default stroke:#5a636e,stroke-width:2px,fill:none;
  </pre>
</div>

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ 
    startOnLoad: true, 
    theme: 'dark',
    securityLevel: 'loose'
  });
</script>