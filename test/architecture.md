---
layout: default
title: "Architecture"
permalink: /architecture.html
---

<div class="content-pane">
  <h2>System Blueprint</h2>
  <p>How the site is built and how it runs. The first version of this chart is kept at <a href="/architecture-v1.html">/architecture-v1.html</a>.</p>

  <h3>Building and publishing</h3>
  <p>Every push to <code>main</code> or <code>dev</code>: new English text is translated, the site is built in 8 languages, checked, and published.</p>
  <pre class="mermaid">
    flowchart TD
    %% ===========================================================
    %% 1. What people edit
    %% ===========================================================
    subgraph Sources [1. Sources: what people edit]
        S1[" _source/*.md<br>(guides and pages, English drafts) "]
        S2[" _data/en/*.yml<br>(tools.yml, ui.yml, server.yml) "]
        S3[" Site code<br>(_layouts, _includes, css, js, api) "]
    end

    %% ===========================================================
    %% 2. Translation (GitHub Actions, on every push)
    %% ===========================================================
    subgraph Translate [2. Translation: GitHub Actions on push]
        T1[" generate_master.rb<br>(guides and pages into 8 languages) "]
        T2[" translate_sections.rb<br>(only sections whose English changed) "]
        T3[(" translation_state.json<br>+ translation_overrides.yml ")]
        T4[" Translation commit<br>(saved back to the branch) "]
    end

    %% ===========================================================
    %% 3. Build (_scripts/build.rb)
    %% ===========================================================
    subgraph Build [3. Build: _scripts/build.rb]
        B1[" split_masters.rb<br>(one file per language) "]
        B2[" sync_ui_data.rb<br>(guide titles and anchors) "]
        B3[" build_translations.rb<br>(text for the API and bot) "]
        B4[" Jekyll<br>(English site, then /de /es /fr /it /ru /tr /uk) "]
        B5[" workbox_precache.rb<br>(offline cache list) "]
        B6[" check_build.rb + Prettier<br>(build and code checks) "]
    end

    %% ===========================================================
    %% 4. Deploy
    %% ===========================================================
    subgraph Deploy [4. Deploy]
        D1{" Which branch? "}
        D2[" Vercel: live site<br>(la-s78.app) "]
        D3[" Vercel: test site<br>(dev.la-s78.app) "]
        D4[" GitHub Pages<br>(redirects to the live site) "]
        D5[" Sync Discord Commands<br>(command picker, after each deploy) "]
    end

    G((" Gemini AI "))
    DC((" Discord "))

    S1 --> T1
    S2 --> T2
    T1 <--> G
    T2 <--> G
    T2 <--> T3
    T1 & T2 --> T4
    T4 --> B1 --> B2 --> B3 --> B4 --> B5 --> B6
    S3 --> B4
    B6 --> D1
    D1 -- main --> D2 & D4
    D1 -- dev --> D3
    D2 --> D5 --> DC

    classDef source fill:#2c221d,stroke:#e6a050,stroke-width:2px,color:#fff;
    classDef script fill:#1e2522,stroke:#23782d,stroke-width:2px,color:#fff;
    classDef jekyll fill:#3b2a3a,stroke:#8c32b4,stroke-width:2px,color:#fff;
    classDef asset fill:#1a2332,stroke:#3278b4,stroke-width:2px,color:#fff;
    classDef deploy fill:#111,stroke:#fff,stroke-width:2px,color:#fff;
    classDef outside fill:#2a1a1a,stroke:#c0504d,stroke-width:2px,color:#fff;

    class S1,S2,S3 source;
    class T1,T2,T4,B1,B2,B3,B5,B6 script;
    class T3 asset;
    class B4 jekyll;
    class D1,D2,D3,D4,D5 deploy;
    class G,DC outside;
  </pre>

  <h3>The live site</h3>
  <p>What happens when people use the site and the Discord bot. Every page and the bot use the same functions and the same stored data.</p>
  <pre class="mermaid">
    flowchart TD
    U((" Players and leaders "))

    %% ===========================================================
    %% 1. In the browser
    %% ===========================================================
    subgraph Browser [1. In the browser]
        direction LR
        P1[" Guides and rules<br>(static pages, 8 languages) "]
        P2[" Live tools<br>(map, Alliance page,<br>calendar, rewards) "]
        P3[" Leader tools<br>(dashboard, nominations,<br>King's console, registration) "]
        P4[" Helpers<br>(i18n.js: text and page language;<br>service worker: offline copies) "]
    end

    DC((" Discord<br>(login, roles,<br>channels, bot) "))

    %% ===========================================================
    %% 2. Vercel serverless functions (/api)
    %% ===========================================================
    subgraph API [2. Vercel functions: /api]
        direction LR
        A1[" Public data<br>(state, calendar,<br>colors, map-image) "]
        A2[" Sign-in<br>(verify: Discord login,<br>signed pass) "]
        A3[" Leader actions<br>(dashboard, nominate, proposal,<br>manage-event, register-alliance) "]
        A4[" Discord bot<br>(interactions: slash<br>commands and buttons) "]
        A5[" Shared helpers<br>(translated messages, safe saves,<br>reward periods, sheet reader) "]
    end

    %% ===========================================================
    %% 3. Stored data and other services
    %% ===========================================================
    subgraph Data [3. Stored data and other services]
        direction LR
        X1[(" GitHub Gist<br>(map, ranks, rewards, nominations,<br>calendar, dashboards; a separate<br>one for the test site) ")]
        X3((" Google Sheets / Docs<br>(dashboard charts) "))
    end

    U -- uses the site --> Browser
    U -- slash commands --> DC
    Browser -- "requests /api (with the page's language)" --> API
    DC -- commands and buttons --> API
    API -- "login check, proposals, alerts" --> DC
    API -- "reads and safe saves" --> X1
    API -- reads shared sheets --> X3

    classDef source fill:#2c221d,stroke:#e6a050,stroke-width:2px,color:#fff;
    classDef script fill:#1e2522,stroke:#23782d,stroke-width:2px,color:#fff;
    classDef jekyll fill:#3b2a3a,stroke:#8c32b4,stroke-width:2px,color:#fff;
    classDef asset fill:#1a2332,stroke:#3278b4,stroke-width:2px,color:#fff;
    classDef outside fill:#2a1a1a,stroke:#c0504d,stroke-width:2px,color:#fff;

    class P1,P2,P3 asset;
    class P4,A5 script;
    class A1,A2,A3,A4 jekyll;
    class X1 source;
    class U,DC,X3 outside;
  </pre>
</div>

<script src="/js/mermaid.min.js"></script>

<script>
  // The site's colours, as plain rgba(): some theme variables use color-mix(), which mermaid
  // can't read (it then falls back to its own pale yellow). A hidden element lets the
  // browser work them out first.
  const siteColor = (variable, property = 'color') => {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    probe.style[property] = `var(${variable})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe)[property];
    probe.remove();
    // Browsers may answer color(srgb …): paint one pixel to get plain numbers.
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
  };
  const cardBg = siteColor('--card-bg', 'backgroundColor');
  const accent = siteColor('--accent-color');

  mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    flowchart: {
      padding: 10,
      rankSpacing: 80,
      // Room under each group's title, so it doesn't sit on the first row of boxes
      subGraphTitleMargin: { top: 6, bottom: 22 },
    },
    themeVariables: {
      primaryColor: cardBg,
      primaryTextColor: accent,
      clusterBkg: cardBg,
      clusterBorder: accent,
      titleColor: accent,
      lineColor: accent,
    },
    // Labels are plain text written here; nothing in the charts comes from visitors.
    securityLevel: 'strict',
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