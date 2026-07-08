---
layout: default
title: "Top-Secret Alliance Intel"
permalink: /api-test/
---
<section class="content-pane private-grid">
<div>
<h2>Logging in is required to view hidden content</h2>
</div>
<div>
<div id="ui-profile-card" class="profile-card-wrapper">
    <!-- main.js will inject your avatar & username here if logged in -->
    <button id="discord-login-btn" class="login-button" onclick="triggerDiscordLogin()">
        Log In via Discord
    </button>
</div>
<p id="gate-error" style="display: none; color: #ff4d4d; font-weight: bold; margin: 15px 0;"></p>
</div>
<div id="gated-content" class="content-locked api-right">
    <h2>🔒 Decrypted Title</h2>
    <p>If you can see this text without logging in, I broke something...</p>
    
    <div class="welcome-banner">
    <h2>Welcome back, <span id="ui-username">Commander</span>!</h2>
    <p>Status: <strong id="ui-rank">Unverified</strong> of <strong id="ui-alliance">the Wastelands</strong>.</p>
</div>
</div>
</section>