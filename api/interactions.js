// api/interactions.js

// Manages interactions between GitHub, Vercel, and Discord
import crypto from "crypto";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import { RULES_DATA, SB_DATA, BOT_DATA } from "./_generated_translations.js";
import { listAllianceRanks, setAllianceRank } from "./_rank_helper.js";
import { getCycleState, DEFAULT_CALENDAR_CONFIG } from "./_calendar_helper.js";

export const config = { api: { bodyParser: false } };

// --- DYNAMIC ALLIANCE COMMAND SCHEMA ---
// Pushed to member alliance servers via /registerbot and /register-alliance
const ALLIANCE_COMMANDS_SCHEMA = [
  {
    name: "calendar",
    description: "View or manage the Kingdom Event Calendar",
    type: 1,
    options: [
      {
        type: 3,
        name: "action",
        description: "Action to perform (leave blank to view calendar)",
        required: false,
        choices: [
          {
            name: "Manage Alliance Events (R5 by default)",
            value: "manage_alliance",
          },
          {
            name: "Manage Global Events (Admin Only)",
            value: "manage_global",
          },
        ],
      },
    ],
  },
  {
    name: "suggest",
    description:
      "Submit a rule proposal, report an alliance issue, or check your ticket status",
    type: 1,
    options: [
      {
        type: 3,
        name: "type",
        description: "Select ticket category or check your active submissions",
        required: true,
        choices: [
          {
            name: "👑 Kingdom / NAP Proposal (Server-Wide Rule or Event Idea)",
            value: "nap_proposal",
          },
          {
            name: "🛡️ Internal Alliance Issue (Handled Privately by Your R4/R5s)",
            value: "alliance_issue",
          },
          {
            name: "📋 View My Ticket Status (Active & Recent History)",
            value: "status",
          },
        ],
      },
    ],
  },
  {
    name: "nominate",
    description:
      "Request an authenticated portal link to submit weekly chest nominations",
    type: 1,
  },
  {
    name: "rewards",
    description: "Display reward allocations and nomination status",
    type: 1,
  },
  {
    name: "sb",
    description:
      "Display the Survival Battle arms race schedule and active events",
    type: 1,
    options: [
      {
        type: 4,
        name: "day",
        description: "Day of the cycle (1-7)",
        required: false,
        min_value: 1,
        max_value: 7,
      },
    ],
  },
  {
    name: "rules",
    description: "Display server and Kingdom NAP rules",
    type: 1,
    options: [
      {
        type: 4,
        name: "rule",
        description: "Specific rule number to view",
        required: false,
        min_value: 1,
      },
    ],
  },
  {
    name: "map",
    description: "View live Last Asylum territory map",
    type: 1,
  },
];

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const SUPPORTED_LOCALES = ["en", "es", "de", "fr", "ru", "it", "tr", "uk"];

const FALLBACK_RULES = [
  {
    title: "📜 1. Respect & Conduct",
    content:
      "**Zero Tolerance:** Bullying, racism, hate speech, harassment, or toxic behavior is prohibited.\n**Community Standard:** Treat all players with respect.\n**Reporting:** You **must** provide screenshots/proof when reporting a violation.",
  },
  {
    title: "🛡️ 2. NAP Protection Rules",
    content:
      "The following actions against **NAP Alliances** and their **Academies** are prohibited:\n> 🚫 No Attacking\n> 🚫 No Scouting",
  },
  {
    title: "💎 3. Resource & Map Etiquette",
    content:
      "**Tile Safety:** Attacking resource tiles is strictly forbidden. Let players farm in peace.",
  },
  {
    title: "🚛 4. Caravans & Black Ops",
    content:
      "Governed by a **Three-Strike System**:\n**Strike 1 & 2:** Reported by R4s. Offender receives a formal warning.\n**Strike 3:** Results in a **Single Base Hit** penalty.\n**Conflict Resolution:** Victims may waive the strike report if an apology is accepted.",
  },
  {
    title: "🤝 5. Member Poaching",
    content:
      "**Active Recruiting:** Messaging members of other NAP alliances to switch is prohibited.\n**Player Autonomy:** Players are free to leave and join alliances voluntarily.\n**Applications:** 'Walk-in' applicants are allowed, provided no prior solicitation occurred.",
  },
  {
    title: "📉 6. Other Alliances",
    content:
      "**Fair Play:** Attacking smaller alliances because they are outside the NAP is forbidden.",
  },
  {
    title: "🕊️ 7. Diplomacy & Conflict Resolution",
    content:
      "1. **Private Resolution:** Handle disputes privately between Alliance Leads/Diplomats first.\n2. **Escalation:** If unresolved, bring to **NAP Leadership**.\n> ⚠️ Do not bring rule disputes, grievances, or drama into General or World Chat. Keep it to private channels.",
  },
  {
    title: "🎓 8. Academies",
    content:
      "**Designation:** Each NAP alliance may protect **one** academy.\n**Governance:** Academies entering the Top 10 do not receive voting rights while they maintain academy status.",
  },
  {
    title: "⚠️ 9. General Rule Violations",
    content:
      "*(Except #4)*\n**1st Offense:** Official Warning.\n**2nd Offense:** Removal from alliance or **NAP Blacklist**.\n**Blacklist Policy:** Prohibits joining any NAP-protected alliance.",
  },
];

const FALLBACK_SB_SCHEDULE = [
  {
    time: "00:00",
    d1: { text: "Enhance Heroes", key: "enhance_heroes" },
    d2: { text: "Build Territory", key: "build_territory" },
    d3: { text: "Train Soldiers", key: "train_soldiers" },
    d4: { text: "Tech Research", key: "tech_research" },
    d5: { text: "Enhance Raven", key: "enhance_raven" },
    d6: { text: "Enhance Heroes", key: "enhance_heroes" },
    d7: { text: "Build Territory", key: "build_territory" },
  },
  {
    time: "04:00",
    d1: { text: "Build Territory", key: "build_territory" },
    d2: { text: "Train Soldiers", key: "train_soldiers" },
    d3: { text: "Tech Research", key: "tech_research" },
    d4: { text: "Enhance Raven", key: "enhance_raven" },
    d5: { text: "Enhance Heroes", key: "enhance_heroes" },
    d6: { text: "Build Territory", key: "build_territory" },
    d7: { text: "Train Soldiers", key: "train_soldiers" },
  },
  {
    time: "08:00",
    d1: { text: "Train Soldiers", key: "train_soldiers" },
    d2: { text: "Tech Research", key: "tech_research" },
    d3: { text: "Enhance Raven", key: "enhance_raven" },
    d4: { text: "Enhance Heroes", key: "enhance_heroes" },
    d5: { text: "Build Territory", key: "build_territory" },
    d6: { text: "Train Soldiers", key: "train_soldiers" },
    d7: { text: "Tech Research", key: "tech_research" },
  },
  {
    time: "12:00",
    d1: { text: "Tech Research", key: "tech_research" },
    d2: { text: "Enhance Raven", key: "enhance_raven" },
    d3: { text: "Enhance Heroes", key: "enhance_heroes" },
    d4: { text: "Build Territory", key: "build_territory" },
    d5: { text: "Train Soldiers", key: "train_soldiers" },
    d6: { text: "Tech Research", key: "tech_research" },
    d7: { text: "Enhance Raven", key: "enhance_raven" },
  },
  {
    time: "16:00",
    d1: { text: "Enhance Raven", key: "enhance_raven" },
    d2: { text: "Enhance Heroes", key: "enhance_heroes" },
    d3: { text: "Build Territory", key: "build_territory" },
    d4: { text: "Train Soldiers", key: "train_soldiers" },
    d5: { text: "Tech Research", key: "tech_research" },
    d6: { text: "Enhance Raven", key: "enhance_raven" },
    d7: { text: "Enhance Heroes", key: "enhance_heroes" },
  },
  {
    time: "20:00",
    d1: { text: "Enhance Heroes", key: "enhance_heroes" },
    d2: { text: "Build Territory", key: "build_territory" },
    d3: { text: "Train Soldiers", key: "train_soldiers" },
    d4: { text: "Tech Research", key: "tech_research" },
    d5: { text: "Enhance Raven", key: "enhance_raven" },
    d6: { text: "Enhance Heroes", key: "enhance_heroes" },
    d7: { text: "Build Territory", key: "build_territory" },
  },
];

const FALLBACK_BOT_STRINGS = {
  sb: {
    current_event: "Current Event",
    next_event: "Next Event",
    schedule_title: "Day {day} Schedule (Game Time / UTC-2)",
    footer:
      "Times are Game Time (UTC-2). Relative countdowns adapt to your local time.",
    button: "View Full Schedule",
  },
  rules: {
    title: "📜 Server Rules",
    description: "Official NAP & Kingdom Rules.",
    not_found_title: "⚠️ Rule Not Found",
    not_found_desc: "Rule {rule} does not exist. Choose between 1 and {max}.",
    button: "Open Rules Page",
  },
  map: {
    title: "🗺️ Last Asylum Territory Map",
    description: "View real-time territory ownership.",
    button: "Web Map",
    footer: "Click the buttons below to switch perspectives",
    views: {
      alliance: {
        title: "🗺️ Last Asylum: Alliance Territories",
        description: "Live territorial ownership by alliance.",
      },
      level: {
        title: "🏰 Last Asylum: Territory Levels",
        description: "Territories categorized by tier (Lv. 1 to Lv. 7).",
      },
      resource: {
        title: "🌾 Last Asylum: Resources & Regional Buffs",
        description: "Territory yields (Grain, Timber, Herbs)",
      },
    },
  },
  admin: {
    access_denied:
      "⛔ **Access Denied:** Only authorized leadership can approve or reject proposals.",
    failed_update: "Failed to apply proposal update:",
  },
};

function getBotStrings(lang) {
  return BOT_DATA?.[lang] || FALLBACK_BOT_STRINGS;
}

function resolveUserLocale(interaction, overrideLang) {
  if (overrideLang && SUPPORTED_LOCALES.includes(overrideLang))
    return overrideLang;
  const userLocale = interaction?.locale || interaction?.guild_locale || "en";
  const baseCode = userLocale.split("-")[0].toLowerCase();
  return SUPPORTED_LOCALES.includes(baseCode) ? baseCode : "en";
}

function cleanHtmlToMarkdown(htmlString) {
  if (!htmlString) return "";
  return htmlString
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?strong>/gi, "**")
    .replace(/<\/?em>/gi, "*")
    .replace(/<\/?p>/gi, "")
    .replace(/<div[^>]*>/gi, "\n> ")
    .replace(/<\/div>/gi, "")
    .replace(/<blockquote[^>]*>/gi, "\n> ")
    .replace(/<\/blockquote>/gi, "")
    .trim();
}

function hexToDiscordColor(hexStr, fallback = 0xb8975a) {
  if (!hexStr || typeof hexStr !== "string") return fallback;
  const cleaned = hexStr.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) return fallback;
  return parseInt(cleaned, 16);
}

const EVENT_EMOJIS = {
  enhance_heroes: "🦸",
  build_territory: "🏰",
  train_soldiers: "⚔️",
  tech_research: "🔬",
  enhance_raven: "🦅",
};

function createHmacToken(payload, secret) {
  const dataString = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(dataString)
    .digest("base64url");
  return `${dataString}.${signature}`;
}

const roleCacheMap = new Map();

async function getGuildRoleMap(guildId, botToken, memberRoleIds = []) {
  const now = Date.now();
  const cached = roleCacheMap.get(guildId);

  if (cached && now - cached.timestamp < 3 * 60 * 1000) {
    const hasUnknownRole = memberRoleIds.some((id) => !cached.map.has(id));
    if (!hasUnknownRole) {
      return cached.map;
    }
  }

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/roles`,
    {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(2200),
    }
  );

  if (!res.ok) throw new Error(`Discord API roles error (${res.status})`);

  const roles = await res.json();
  const map = new Map();
  roles.forEach((r) => map.set(r.id, r.name.toLowerCase().trim()));

  roleCacheMap.set(guildId, {
    map,
    timestamp: now,
  });

  return map;
}

function matchesRoleKeyword(roleName, keyword) {
  if (!roleName || !keyword) return false;
  const cleanRole = roleName
    .toLowerCase()
    .replace(/[@\[\]]/g, " ")
    .trim();
  const cleanKey = keyword
    .toLowerCase()
    .replace(/[@\[\]]/g, " ")
    .trim();
  if (cleanRole === cleanKey) return true;
  const escapedKey = cleanKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\s|_|-)${escapedKey}(\\s\vert{}_\vert{}-\vert{}$)`, "i");
  return regex.test(cleanRole);
}

async function getGistData(gistId, gistToken) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${gistToken}`,
      "User-Agent": "WarRoom-App",
    },
    signal: AbortSignal.timeout(2500),
  });

  if (!res.ok) throw new Error(`GitHub Gist error (${res.status})`);
  return res.json();
}

async function patchGistFile(gistId, gistToken, filename, contentObj, description) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${gistToken}`,
      "Content-Type": "application/json",
      "User-Agent": "WarRoom-App",
    },
    body: JSON.stringify({
      description: description || `Updated ${filename} at${new Date().toISOString()}`,
      files: {
        [filename]: {
          content: JSON.stringify(contentObj, null, 2),
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gist PATCH failed (${res.status})`);
  return res.json();
}

/**
 * Enforces 30-day auto-expiry (44d if extended) and 60-day GDPR identity scrubbing
 */
function applyTicketRetentionPolicy(suggestionsState) {
  let mutated = false;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const THIRTY_DAYS_MS = 30 * 86400 * 1000;

  if (!Array.isArray(suggestionsState.suggestions)) {
    suggestionsState.suggestions = [];
  }

  for (const tkt of suggestionsState.suggestions) {
    const isActive =
      tkt.status === "pending_alliance" || tkt.status === "in_discussion";

    // 1. Auto-expire unfinalized tickets past their deadline
    if (isActive) {
      const createdMs = new Date(tkt.created_at).getTime() || nowMs;
      const defaultDeadlineMs =
        createdMs + (tkt.extended ? 44 : 30) * 86400 * 1000;
      const expiryMs = tkt.expires_at
        ? new Date(tkt.expires_at).getTime()
        : defaultDeadlineMs;

      if (nowMs >= expiryMs) {
        tkt.status = "expired";
        tkt.closed_at = nowIso;
        tkt.resolution_note =
          "Closed automatically due to 30 days of inactivity.";
        mutated = true;
      }
    }

    // 2. GDPR Scrub: 30 days after closure, scrub personal identifiers
    if (!isActive && tkt.closed_at && tkt.author_id !== null) {
      const closedMs = new Date(tkt.closed_at).getTime();
      if (!isNaN(closedMs) && nowMs - closedMs >= THIRTY_DAYS_MS) {
        tkt.author_id = null;
        tkt.author_tag = "Archived Member";
        mutated = true;
      }
    }
  }

  return mutated;
}

/**
 * Safely archives a Discord thread (verifies channel type 11 or 12 first)
 */
async function safeArchiveThread(threadId, botToken) {
  if (!threadId || !botToken) return;
  try {
    const checkRes = await fetch(
      `https://discord.com/api/v10/channels/${threadId}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
      }
    );
    if (!checkRes.ok) return;
    const channelData = await checkRes.json();

    // Type 11 = PUBLIC_THREAD, Type 12 = PRIVATE_THREAD
    if (channelData.type !== 11 && channelData.type !== 12) {
      console.warn(
        `Safety Guard: Refusing to archive non-thread channel ${threadId} (type${channelData.type})`
      );
      return;
    }

    await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived: true, locked: true }),
    });
  } catch (err) {
    console.warn("Could not archive thread:", err.message);
  }
}

/**
 * Builds the Triage Embed & Action Components for an Alliance Officer Channel
 */
function buildTriageCardPayload(ticket, allianceColorHex) {
  const isNap = ticket.type === "nap_proposal";
  const embedColor = isNap
    ? 0xb8975a
    : hexToDiscordColor(allianceColorHex, 0x3b82f6);

  const statusLabels = {
    pending_alliance: "⏳ Pending Officer Review",
    in_discussion: "💬 In Discussion with Submitter",
    endorsed_to_council: `🚀 Endorsed to NAP by ${ticket.officer_vouched_by || "Leadership"}`,
    resolved: `✅ Resolved by ${ticket.officer_vouched_by || "Leadership"}`,
    declined: `❌ Declined by ${ticket.officer_vouched_by || "Leadership"}`,
    expired: "⌛ Expired (30d Inactivity)",
  };

  let finalColor = embedColor;
  if (ticket.status === "endorsed_to_council" || ticket.status === "resolved") {
    finalColor = 0x22c55e;
  } else if (ticket.status === "declined" || ticket.status === "expired") {
    finalColor = 0x64748b;
  }

  const fields = [
    {
      name: "👤 Submitter",
      value: ticket.author_id
        ? `<@${ticket.author_id}> (\`${ticket.author_tag}\`)`
        : `\`${ticket.author_tag || "Archived Member"}\``,
      inline: true,
    },
    {
      name: "🏷️ Category",
      value: isNap
        ? "👑 **Kingdom / NAP Proposal**"
        : `🛡️ **[${ticket.alliance}] Alliance Ticket**`,
      inline: true,
    },
    {
      name: "⚠️ Observed Issue / Problem",
      value: ticket.problem || "*None provided*",
      inline: false,
    },
    {
      name: "💡 Proposed Solution",
      value: ticket.solution || "*No specific solution proposed*",
      inline: false,
    },
    {
      name: "📌 Status",
      value: statusLabels[ticket.status] || ticket.status,
      inline: false,
    },
  ];

  if (ticket.resolution_note) {
    fields.push({
      name: "📝 Leadership Note",
      value: ticket.resolution_note,
      inline: false,
    });
  }

  const isClosed = !["pending_alliance", "in_discussion"].includes(
    ticket.status
  );

  const primaryButton = isNap
    ? {
        type: 2,
        style: 3,
        label: "Endorse to NAP",
        custom_id: `tkt_endorse:${ticket.id}`,
        emoji: { name: "🚀" },
        disabled: isClosed,
      }
    : {
        type: 2,
        style: 3,
        label: "Resolve",
        custom_id: `tkt_resolve:${ticket.id}`,
        emoji: { name: "✅" },
        disabled: isClosed,
      };

  const declineButton = {
    type: 2,
    style: 4,
    label: "Decline",
    custom_id: `tkt_decline:${ticket.id}`,
    emoji: { name: "❌" },
    disabled: isClosed,
  };

  const manageButton = {
    type: 2,
    style: 2,
    label: ticket.thread_id ? "Manage (Thread Active)" : "Manage",
    custom_id: `tkt_manage:${ticket.id}`,
    emoji: { name: "🛠️" },
    disabled: isClosed || Boolean(ticket.thread_id),
  };

  return {
    embeds: [
      {
        title: `${isNap ? "👑 NAP Proposal" : "🛡️ Alliance Ticket"} #${ticket.id} —${ticket.title}`,
        color: finalColor,
        fields,
        footer: {
          text: `[${ticket.alliance}] Leadership Triage • Submitted`,
        },
        timestamp: ticket.created_at,
      },
    ],
    components: [
      {
        type: 1,
        components: [primaryButton, declineButton, manageButton],
      },
    ],
  };
}

let mapRevisionCache = {
  revision: "initial",
  timestamp: 0,
};

async function getLatestMapRevision(gistId, gistToken) {
  const now = Date.now();
  if (
    mapRevisionCache.revision &&
    now - mapRevisionCache.timestamp < 45 * 1000
  ) {
    return mapRevisionCache.revision;
  }
  try {
    const gistData = await getGistData(gistId, gistToken);
    const content = gistData.files?.["map-state.json"]?.content;
    if (content) {
      const state = JSON.parse(content);
      mapRevisionCache.revision =
        state.revision || state.lastUpdated || "initial";
      mapRevisionCache.timestamp = now;
    }
  } catch (e) {
    if (!mapRevisionCache.revision || mapRevisionCache.revision === "initial") {
      mapRevisionCache.revision = Math.floor(now / (5 * 60 * 1000)).toString();
    }
  }
  return mapRevisionCache.revision;
}

function buildMapMessagePayload({
  view = "level",
  revision = "initial",
  resolvedHost,
  lang,
  t,
}) {
  const selectedView = ["level", "alliance", "resource"].includes(view)
    ? view
    : "level";

  const titles = {
    level: "🏰 Last Asylum: Territory Levels",
    alliance: "🗺️ Last Asylum: Alliance Territories",
    resource: "🌾 Last Asylum: Resources & Regional Buffs",
  };

  const descriptions = {
    level: "Territories categorized by tier (Lv. 1 to Lv. 8).",
    alliance: "Territories colored by alliance ownership.",
    resource: "Territories colored by resource yields and regional buffs.",
  };

  const embedColors = {
    level: 0xca8a04,
    alliance: 0x0070f3,
    resource: 0x059669,
  };

  const mapImageUrl = `https://${resolvedHost}/api/map-image?view=${selectedView}&v=${revision}&ext=.png`;

  return {
    embeds: [
      {
        title: titles[selectedView],
        description: descriptions[selectedView],
        color: embedColors[selectedView],
        image: { url: mapImageUrl },
        footer: { text: "Click the buttons below to switch perspectives" },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: selectedView === "level" ? 1 : 2,
            label: "Levels",
            custom_id: "map_view:level",
            disabled: selectedView === "level",
            emoji: { name: "🏰" },
          },
          {
            type: 2,
            style: selectedView === "alliance" ? 1 : 2,
            label: "Alliances",
            custom_id: "map_view:alliance",
            disabled: selectedView === "alliance",
            emoji: { name: "🗺️" },
          },
          {
            type: 2,
            style: selectedView === "resource" ? 1 : 2,
            label: "Resources",
            custom_id: "map_view:resource",
            disabled: selectedView === "resource",
            emoji: { name: "🌾" },
          },
          {
            type: 2,
            style: 5,
            label: t?.map?.button || "Web Map",
            url: `https://${resolvedHost}/${lang}/map.html`,
          },
        ],
      },
    ],
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  if (!signature || !timestamp)
    return res.status(401).send("Missing signature headers");

  const rawBody = await getRawBody(req);
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return res.status(500).send("Server configuration error");

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) return res.status(401).send("Bad request signature");

  const interaction = JSON.parse(rawBody.toString());

  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({ type: InteractionResponseType.PONG });
  }

  // =========================================================================
  // 1. SLASH COMMAND HANDLING (TYPE 2)
  // =========================================================================
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const rawHost =
      req.headers["x-forwarded-host"] || req.headers.host || "la-s78.app";
    const resolvedHost = rawHost.split(",")[0].trim();
    const providedLang = options?.find((opt) => opt.name === "lang")?.value;
    const lang = resolveUserLocale(interaction, providedLang);
    const t = getBotStrings(lang);

    // --- /suggest COMMAND ---
    if (name === "suggest") {
      const guildId = interaction.guild_id;
      const member = interaction.member;
      const userId = member?.user?.id || interaction.user?.id;
      const botToken = process.env.DISCORD_BOT_TOKEN;
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;
      const napGuildId = (
        process.env.DISCORD_GUILD_ID_NAP ||
        process.env.DISCORD_GUILD_ID ||
        ""
      ).trim();
      const wloGuildId = (
        process.env.DISCORD_GUILD_ID_WLO ||
        process.env.DISCORD_WLO ||
        ""
      ).trim();

      const subType =
        options?.find((opt) => opt.name === "type")?.value || "status";

      try {
        const gistData = await getGistData(GIST_ID, GIST_TOKEN);
        const mapState = JSON.parse(
          gistData.files?.["map-state.json"]?.content || "{}"
        );
        const suggestionsRaw =
          gistData.files?.["suggestions-state.json"]?.content;
        const suggestionsState = suggestionsRaw
          ? JSON.parse(suggestionsRaw)
          : { next_ticket_id: 1, suggestions: [] };

        // Apply lazy 30d auto-expiry & 60d GDPR scrub
        const wasCleaned = applyTicketRetentionPolicy(suggestionsState);
        if (wasCleaned) {
          patchGistFile(
            GIST_ID,
            GIST_TOKEN,
            "suggestions-state.json",
            suggestionsState,
            "Automated ticket retention policy update"
          ).catch(() => {});
        }

        // Resolve Alliance Context
        const alliances = mapState.alliances || {};
        let detectedAllianceTag = null;
        let allianceData = null;

        const registeredEntry = Object.entries(alliances).find(
          ([_, data]) =>
            data?.guild_id && String(data.guild_id).trim() === guildId
        );

        if (registeredEntry) {
          detectedAllianceTag = registeredEntry[0];
          allianceData = registeredEntry[1];
        } else if (wloGuildId && guildId === wloGuildId) {
          detectedAllianceTag = "WLO";
          allianceData = alliances["WLO"] || {};
        } else if (napGuildId && guildId === napGuildId && member?.roles) {
          const roleMap = await getGuildRoleMap(
            guildId,
            botToken,
            member.roles
          );
          const memberRoleNames = member.roles
            .map((id) => roleMap.get(id))
            .filter(Boolean);
          detectedAllianceTag = Object.keys(alliances).find((tag) => {
            const cleanTag = tag.toLowerCase();
            return memberRoleNames.some(
              (r) =>
                r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`
            );
          });
          if (detectedAllianceTag) {
            allianceData = alliances[detectedAllianceTag];
          }
        }

        // --- SUB-OPTION: View My Ticket Status ---
        if (subType === "status") {
          const userTickets = (suggestionsState.suggestions || []).filter(
            (s) => s.author_id === userId
          );

          const activeTickets = userTickets.filter(
            (s) =>
              s.status === "pending_alliance" || s.status === "in_discussion"
          );
          const closedTickets = userTickets
            .filter(
              (s) =>
                s.status !== "pending_alliance" && s.status !== "in_discussion"
            )
            .sort(
              (a, b) =>
                new Date(b.closed_at || b.created_at) -
                new Date(a.closed_at || a.created_at)
            )
            .slice(0, 3);

          const statusMap = {
            pending_alliance: "⏳ Pending Officer Review",
            in_discussion: "💬 In Discussion with Officers",
            endorsed_to_council: "🚀 Endorsed to NAP Council",
            resolved: "✅ Resolved by Leadership",
            declined: "❌ Declined",
            expired: "⌛ Expired (30d Inactivity)",
          };

          const fields = [];

          if (activeTickets.length > 0) {
            activeTickets.forEach((tkt) => {
              const createdTs = Math.floor(
                new Date(tkt.created_at).getTime() / 1000
              );
              fields.push({
                name: `📌 #${tkt.id} — ${tkt.title} (${tkt.type === "nap_proposal" ? "NAP Proposal" : `[${tkt.alliance}] Issue`})`,
                value: `• **Status:** ${statusMap[tkt.status] || tkt.status}\n• **Submitted:** <t:${createdTs}:R>${tkt.extended ? "\n• *Extended +14d for review*" : ""}`,
                inline: false,
              });
            });
          } else {
            fields.push({
              name: "📭 Active Submissions (0 / 2)",
              value: "You currently have no open tickets awaiting review.",
              inline: false,
            });
          }

          if (closedTickets.length > 0) {
            const historyLines = closedTickets.map((tkt) => {
              const noteStr = tkt.resolution_note
                ? `\n  ↳ *Note: ${tkt.resolution_note}*`
                : "";
              return `• **#${tkt.id} [${tkt.title}]** — ${statusMap[tkt.status] \vert{}\vert{} tkt.status}${noteStr}`;
            });

            fields.push({
              name: "🕓 Recent Resolved History (Last 30 Days)",
              value: historyLines.join("\n"),
              inline: false,
            });
          }

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: `📋 Your Ticket Status (${activeTickets.length} / 2 Active Slots Used)`,
                  color: hexToDiscordColor(allianceData?.color, 0xb8975a),
                  fields,
                  footer: {
                    text: "Resolved tickets are automatically anonymized after 30 days.",
                  },
                },
              ],
              flags: 64,
            },
          });
        }

        // --- SUB-OPTIONS: Open Modal for NAP Proposal or Alliance Issue ---
        if (!detectedAllianceTag || !allianceData) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⚠️ Could not detect your registered alliance. Please run `/suggest` inside your alliance's Discord server.",
              flags: 64,
            },
          });
        }

        if (!allianceData.officer_channel_id) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ **[${detectedAllianceTag}]** leadership has not linked an Officer Ticket Intake Channel yet. Please ask your R5 to update their server registration via \`/registerbot\`.`,
              flags: 64,
            },
          });
        }

        // Check Concurrency Limit (Max 2 active tickets per player)
        const activeUserTickets = (suggestionsState.suggestions || []).filter(
          (s) =>
            s.author_id === userId &&
            (s.status === "pending_alliance" || s.status === "in_discussion")
        );

        if (activeUserTickets.length >= 2) {
          const openIds = activeUserTickets.map((s) => `#${s.id}`).join(", ");
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⏳ **Active Limit Reached (2 / 2):** You currently have 2 open submissions (${openIds}) awaiting leadership review.\n\nPlease wait for at least one to be resolved before submitting another. You can check their progress anytime with \`/suggest type:status\`.`,
              flags: 64,
            },
          });
        }

        const isNapProposal = subType === "nap_proposal";

        return res.status(200).json({
          type: 9, // InteractionResponseType.MODAL
          data: {
            custom_id: `suggest_modal:${subType}:${detectedAllianceTag}`,
            title: isNapProposal
              ? `👑 [${detectedAllianceTag}] Kingdom / NAP Proposal`
              : `🛡️ [${detectedAllianceTag}] Internal Alliance Ticket`,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "sug_title",
                    label: "Subject / Topic",
                    style: 1,
                    min_length: 4,
                    max_length: 75,
                    placeholder: isNapProposal
                      ? "e.g., Adjust Kill Event shielding rules for academies"
                      : "e.g., Cheese Trap timing or hive tile coordination",
                    required: true,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "sug_problem",
                    label: "Observed Problem or Issue",
                    style: 2,
                    min_length: 15,
                    max_length: 700,
                    placeholder:
                      "Describe the issue or friction clearly so leadership can evaluate it...",
                    required: true,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "sug_solution",
                    label: "Proposed Solution (Optional)",
                    style: 2,
                    max_length: 700,
                    placeholder:
                      "Optional: Share any specific fix or compromise you have in mind...",
                    required: false,
                  },
                ],
              },
            ],
          },
        });
      } catch (err) {
        console.error("/suggest command error:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `⚠️ Service busy: ${err.message}. Please try again in a moment.`,
            flags: 64,
          },
        });
      }
    }

    // --- /calendar COMMAND ---
    if (name === "calendar") {
      const guildId = interaction.guild_id;
      const member = interaction.member;
      const userId = member?.user?.id || interaction.user?.id;
      const botToken = process.env.DISCORD_BOT_TOKEN;
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;
      const napGuildId = (
        process.env.DISCORD_GUILD_ID_NAP ||
        process.env.DISCORD_GUILD_ID ||
        ""
      ).trim();
      const wloGuildId = (
        process.env.DISCORD_GUILD_ID_WLO ||
        process.env.DISCORD_WLO ||
        ""
      ).trim();

      const requestedAction = options?.find(
        (opt) => opt.name === "action"
      )?.value;

      let calConfig = DEFAULT_CALENDAR_CONFIG;
      let alliances = {};

      try {
        if (GIST_ID && GIST_TOKEN) {
          const gistData = await getGistData(GIST_ID, GIST_TOKEN);
          const calRaw = gistData.files?.["calendar-state.json"]?.content;
          const mapRaw = gistData.files?.["map-state.json"]?.content;

          if (calRaw) calConfig = { ...calConfig, ...JSON.parse(calRaw) };
          if (mapRaw) alliances = JSON.parse(mapRaw).alliances || {};
        }
      } catch (err) {
        console.warn(
          "Calendar state fetch failed, using defaults:",
          err.message
        );
      }

      // 1. Resolve Alliance from Guild ID first
      let detectedAllianceTag = null;
      let allianceData = null;

      const registeredEntry = Object.entries(alliances).find(
        ([_, data]) =>
          data?.guild_id && String(data.guild_id).trim() === guildId
      );

      if (registeredEntry) {
        detectedAllianceTag = registeredEntry[0];
        allianceData = registeredEntry[1];
      } else if (wloGuildId && guildId === wloGuildId) {
        detectedAllianceTag = "WLO";
        allianceData = alliances["WLO"] || {
          delegated_roles: ["hr", "officer"],
        };
      }

      // 2. If in NAP Server, resolve Alliance from assigned Discord roles
      let memberRoleNames = [];
      const memberRoleIds = member?.roles || [];

      if (guildId && botToken && memberRoleIds.length > 0) {
        try {
          const roleMap = await getGuildRoleMap(
            guildId,
            botToken,
            memberRoleIds
          );
          memberRoleNames = memberRoleIds
            .map((id) => roleMap.get(id))
            .filter(Boolean);
        } catch (roleErr) {
          console.warn("Role map lookup failed:", roleErr.message);
        }
      }

      if (!detectedAllianceTag && napGuildId && guildId === napGuildId) {
        const knownTags = Object.keys(alliances);
        detectedAllianceTag = knownTags.find((tag) => {
          const cleanTag = tag.toLowerCase();
          return memberRoleNames.some(
            (r) =>
              r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`
          );
        });
        if (detectedAllianceTag) {
          allianceData = alliances[detectedAllianceTag];
        }
      }

      // --- SUB-ACTION: Manage Global Events (Admin Only) ---
      if (requestedAction === "manage_global") {
        if (userId !== process.env.AUTHORIZED_USER_ID) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⛔ **Access Denied:** Only the authorized administrator can manage Kingdom-wide events.",
              flags: 64,
            },
          });
        }

        const tokenPayload = {
          scope: "global",
          action: "manage_events",
          exp: Date.now() + 4 * 60 * 60 * 1000,
        };
        const token = createHmacToken(tokenPayload, botToken);
        const manageUrl = `https://${resolvedHost}/calendar.html?token=${token}`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "👑 Kingdom Event Management Portal",
                color: 0x10b981,
                description:
                  "Click below to open the Kingdom Calendar in **Global Management Mode**.\n\nYou can schedule kingdom-wide announcements, truce alerts, or delete entries.",
                footer: { text: "Link is private and expires in 4 hours." },
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Open Global Management Portal",
                    url: manageUrl,
                  },
                ],
              },
            ],
            flags: 64,
          },
        });
      }

      // --- SUB-ACTION: Manage Alliance Events (R5 / Officers) ---
      if (requestedAction === "manage_alliance") {
        if (!detectedAllianceTag) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⚠️ Could not detect your alliance. Run this command inside your registered alliance server, or ensure you have your alliance role in the NAP server.",
              flags: 64,
            },
          });
        }

        const isAdmin = (BigInt(member?.permissions || "0") & 8n) === 8n;
        const allowedRoles = [
          "r5",
          ...(allianceData?.delegated_roles || ["hr", "officer", "leader"]),
        ];
        const isAuthorized =
          userId === process.env.AUTHORIZED_USER_ID ||
          isAdmin ||
          memberRoleNames.some((roleName) =>
            allowedRoles.some((kw) => matchesRoleKeyword(roleName, kw))
          );

        if (!isAuthorized) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⛔ **Access Denied:** Only members holding **@R5** or leadership roles (${allowedRoles.map((r) => "@" + r).join(", ")}) can manage events for **[${detectedAllianceTag}]**.`,
              flags: 64,
            },
          });
        }

        const tokenPayload = {
          scope: detectedAllianceTag,
          alliance: detectedAllianceTag,
          action: "manage_events",
          exp: Date.now() + 4 * 60 * 60 * 1000,
        };
        const token = createHmacToken(tokenPayload, botToken);
        const manageUrl = `https://${resolvedHost}/calendar.html?token=${token}`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `🛡️ Alliance Event Management — [${detectedAllianceTag}]`,
                color: hexToDiscordColor(allianceData?.color, 0x3b82f6),
                description: `Click below to open the calendar in **Alliance Management Mode** for **[${detectedAllianceTag}]**.\n\nYou can schedule internal raids, hive movements, and training drills.`,
                footer: { text: "Link is private and expires in 4 hours." },
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: `Open [${detectedAllianceTag}] Management Portal`,
                    url: manageUrl,
                  },
                ],
              },
            ],
            flags: 64,
          },
        });
      }

      // --- DEFAULT ACTION: Public Calendar Status & Link ---
      const now = new Date();
      const state = getCycleState(now, calConfig);

      const holderEntry = Object.entries(alliances).find(
        ([_, data]) => parseInt(data.rank, 10) === state.capitolRank
      );
      const holderTag = holderEntry
        ? `[${holderEntry[0]}]`
        : `Rank #${state.capitolRank}`;

      const daysUntilNextWeek = 7 - state.dayOfWeekNumber + 1;
      const nextWeekResetTs =
        state.nextResetTimestamp + (daysUntilNextWeek - 1) * 86400;
      const nextWeekNum = (state.currentWeekNumber % 4) + 1;
      const nextWeekConfig = calConfig.capitol_rotation.find(
        (w) => w.week === nextWeekNum
      );

      const nextHolderEntry = Object.entries(alliances).find(
        ([_, data]) => parseInt(data.rank, 10) === nextWeekConfig?.capitol_rank
      );
      const nextHolderTag = nextHolderEntry
        ? `[${nextHolderEntry[0]}]`
        : `Rank #${nextWeekConfig?.capitol_rank}`;

      const fields = [
        {
          name: "👑 Active Capitol Holder",
          value: `**${holderTag}** *(Rank #${state.capitolRank})*`,
          inline: true,
        },
        {
          name: "🔄 Cycle Progress",
          value: `Day **${state.cycleDay}** of 28 *(Week ${state.currentWeekNumber})*`,
          inline: true,
        },
        {
          name: "⏰ Next Daily Reset (00:00 GT)",
          value: `<t:${state.nextResetTimestamp}:R> (<t:${state.nextResetTimestamp}:t>)`,
          inline: false,
        },
      ];

      if (state.isKW) {
        fields.push({
          name: state.isKWBattleDay
            ? "⚔️ Kingdom War Battle (TODAY)"
            : "⚔️ Next Kingdom War Battle",
          value: state.isKWBattleDay
            ? "🔥 **Active War Window:** Defend and conquer the capitol!"
            : `Scheduled for **Saturday** (<t:${state.kwBattleTimestamp}:R> / <t:${state.kwBattleTimestamp}:D>)`,
          inline: false,
        });
      }

      fields.push({
        name: "⏭️ Next Rotation Phase",
        value: `**${nextWeekConfig?.phase || "Next Phase"}** begins <t:${nextWeekResetTs}:R>.\nCapitol transfers to **${nextHolderTag}** *(Rank #${nextWeekConfig?.capitol_rank})*.`,
        inline: false,
      });

      const viewQuery = detectedAllianceTag
        ? `?alliance=${detectedAllianceTag}`
        : "";
      const buttonLabel = detectedAllianceTag
        ? `Open Calendar ([${detectedAllianceTag}])`
        : "Open Full Calendar";

      const defaultColor = state.isKW
        ? 0x8f0000
        : hexToDiscordColor(allianceData?.color, 0xb8975a);

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: `📅 Kingdom War & Rotation Calendar — ${state.phaseName}`,
              color: defaultColor,
              description: state.isKW
                ? "⚔️ **Kingdom War Cycle is ACTIVE.** 2x Reward allocations apply this week."
                : "🛡️ **NAP Rest Week.** Standard kingdom operations and territory consolidation.",
              fields: fields,
              footer: { text: "Last Asylum Kingdom Calendar" },
              timestamp: new Date().toISOString(),
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: buttonLabel,
                  url: `https://${resolvedHost}/calendar.html${viewQuery}`,
                },
              ],
            },
          ],
        },
      });
    }

    // --- /sb COMMAND ---
    if (name === "sb") {
      const now = new Date();

      // Game Time is UTC-2 (subtract 2 hours from UTC)
      const gameTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const gameHour = gameTime.getUTCHours();

      const rawDay = gameTime.getUTCDay();
      const defaultDay = rawDay === 0 ? 7 : rawDay;
      const selectedDay =
        options?.find((opt) => opt.name === "day")?.value || defaultDay;
      const isToday = selectedDay === defaultDay;

      let sbSchedule = FALLBACK_SB_SCHEDULE;
      if (SB_DATA && SB_DATA[lang] && SB_DATA[lang].length > 0) {
        sbSchedule = SB_DATA[lang];
      } else if (SB_DATA && SB_DATA["en"] && SB_DATA["en"].length > 0) {
        sbSchedule = SB_DATA["en"];
      }

      const slotHours = [0, 4, 8, 12, 16, 20];
      let activeSlotIndex = 0;
      for (let i = slotHours.length - 1; i >= 0; i--) {
        if (gameHour >= slotHours[i]) {
          activeSlotIndex = i;
          break;
        }
      }

      const nextSlotIndex = (activeSlotIndex + 1) % 6;
      const dayKey = `d${selectedDay}`;

      const nextSlotHourGT = (slotHours[activeSlotIndex] + 4) % 24;
      const nextSlotUtcHour = (nextSlotHourGT + 2) % 24;

      const nextSlotTime = new Date(now);
      nextSlotTime.setUTCHours(nextSlotUtcHour, 0, 0, 0);

      if (nextSlotHourGT <= gameHour) {
        nextSlotTime.setUTCDate(nextSlotTime.getUTCDate() + 1);
      }
      const nextTimestamp = Math.floor(nextSlotTime.getTime() / 1000);

      let currentEventText = "Event";
      let currentEventEmoji = "▫️";
      let nextEventText = "Event";
      let nextEventEmoji = "▫️";

      const timeline = slotHours
        .map((hour, idx) => {
          const timeStr = `${String(hour).padStart(2, "0")}:00 GT`;
          const slotData = sbSchedule?.[idx]?.[dayKey];
          const text = slotData?.text || `Event ${idx + 1}`;
          const emoji = EVENT_EMOJIS[slotData?.key] || "▫️";

          if (idx === activeSlotIndex) {
            currentEventText = text;
            currentEventEmoji = emoji;
          }
          if (idx === nextSlotIndex) {
            nextEventText = text;
            nextEventEmoji = emoji;
          }

          if (isToday && idx === activeSlotIndex) {
            return `▶ **${timeStr} — ${emoji}${text} (ACTIVE)**`;
          }
          return `• \`${timeStr}\` — ${emoji}${text}`;
        })
        .join("\n");

      const fields = [];
      if (isToday) {
        fields.push(
          {
            name: `🟢 ${t.sb.current_event} (Ends <t:${nextTimestamp}:R>)`,
            value: `**${currentEventEmoji}${currentEventText}**`,
            inline: false,
          },
          {
            name: `⏳ ${t.sb.next_event} (<t:${nextTimestamp}:t>)`,
            value: `${nextEventEmoji}${nextEventText}`,
            inline: false,
          }
        );
      }
      const scheduleTitleText = t.sb.schedule_title.replace(
        "{day}",
        selectedDay
      );
      fields.push({
        name: `📋 ${scheduleTitleText}`,
        value: timeline,
        inline: false,
      });

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: `🏮 Survival Battle — Day ${selectedDay}`,
              color: 0xb29a20,
              fields: fields,
              footer: { text: t.sb.footer },
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: t.sb.button,
                  url: `https://${resolvedHost}/${lang}/guides/survival.html`,
                },
              ],
            },
          ],
        },
      });
    }

    // --- /rules COMMAND ---
    if (name === "rules") {
      const requestedRule = options?.find((opt) => opt.name === "rule")?.value;

      let rulesData = FALLBACK_RULES;
      if (RULES_DATA && RULES_DATA[lang] && RULES_DATA[lang].length > 0) {
        rulesData = RULES_DATA[lang];
      } else if (
        RULES_DATA &&
        RULES_DATA["en"] &&
        RULES_DATA["en"].length > 0
      ) {
        rulesData = RULES_DATA["en"];
      }

      let title = t.rules.title;
      let fields = [];
      let description;

      if (requestedRule) {
        const ruleIndex = requestedRule - 1;
        const targetRule = rulesData[ruleIndex];

        if (targetRule) {
          title = targetRule.title;
          description = cleanHtmlToMarkdown(targetRule.content);
        } else {
          title = t.rules.not_found_title;
          description = t.rules.not_found_desc
            .replace("{rule}", requestedRule)
            .replace("{max}", rulesData.length);
        }
      } else {
        description = t.rules.description;
        fields = rulesData.map((rule) => ({
          name: rule.title,
          value: cleanHtmlToMarkdown(rule.content),
          inline: false,
        }));
      }

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: title,
              description: description,
              color: 0x8f0000,
              fields: fields,
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: t.rules.button,
                  url: `https://${resolvedHost}/${lang}/rules.html`,
                },
              ],
            },
          ],
        },
      });
    }

    // --- /map COMMAND ---
    if (name === "map") {
      try {
        let selectedView = "level";
        const viewOpt = options?.find((opt) => opt.name === "view");
        if (viewOpt?.value) {
          selectedView = String(viewOpt.value).toLowerCase();
        } else if (viewOpt?.options?.[0]?.value) {
          selectedView = String(viewOpt.options[0].value).toLowerCase();
        }

        const revision = await getLatestMapRevision(
          process.env.GIST_ID,
          process.env.GIST_TOKEN
        );
        const payload = buildMapMessagePayload({
          view: selectedView,
          revision,
          resolvedHost,
          lang,
          t,
        });

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: payload,
        });
      } catch (err) {
        console.error("Error handling /map command:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "⚠️ Could not generate map preview.", flags: 64 },
        });
      }
    }

    // --- /registerbot COMMAND (NAP Server Only) ---
    if (name === "registerbot") {
      const guildId = interaction.guild_id;
      const member = interaction.member;
      const userId = member?.user?.id || interaction.user?.id;
      const botToken = process.env.DISCORD_BOT_TOKEN;
      const clientId = process.env.DISCORD_CLIENT_ID;
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;
      const napGuildId = (
        process.env.DISCORD_GUILD_ID_NAP ||
        process.env.DISCORD_GUILD_ID ||
        ""
      ).trim();

      const requestedAction = options?.find(
        (opt) => opt.name === "action"
      )?.value;

      if (!napGuildId || guildId !== napGuildId) {
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
              "⚠️ This command can only be executed in the official NAP server.",
            flags: 64,
          },
        });
      }

      if (requestedAction === "sync") {
        if (userId !== process.env.AUTHORIZED_USER_ID) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⛔ **Access Denied:** Only the kingdom bot administrator can broadcast-sync commands.",
              flags: 64,
            },
          });
        }

        try {
          const gistData = await getGistData(GIST_ID, GIST_TOKEN);
          const mapState = JSON.parse(
            gistData.files["map-state.json"]?.content || "{}"
          );
          const alliances = mapState.alliances || {};

          const results = [];
          for (const [tag, data] of Object.entries(alliances)) {
            if (!data.guild_id) continue;

            const syncRes = await fetch(
              `https://discord.com/api/v10/applications/${clientId}/guilds/${data.guild_id}/commands`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bot ${botToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(ALLIANCE_COMMANDS_SCHEMA),
              }
            );

            results.push(
              `${syncRes.ok ? "✅" : "❌"} **[${tag}]** (\`${data.guild_id}\`)`
            );
          }

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: "🔄 Alliance Slash Commands Broad-Synced",
                  color: 0x22c55e,
                  description: results.length
                    ? `Pushed latest command schema to:\n\n${results.join("\n")}`
                    : "⚠️ No registered alliance servers found in state.",
                  footer: { text: "Last Asylum Bot Deployment Manager" },
                  timestamp: new Date().toISOString(),
                },
              ],
              flags: 64,
            },
          });
        } catch (err) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `❌ Sync failed: ${err.message}`, flags: 64 },
          });
        }
      }

      try {
        const memberRoleIds = member.roles || [];
        const [roleMap, gistData] = await Promise.all([
          getGuildRoleMap(guildId, botToken, memberRoleIds),
          getGistData(GIST_ID, GIST_TOKEN),
        ]);

        const memberRoleNames = memberRoleIds
          .map((id) => roleMap.get(id))
          .filter(Boolean);
        const isR5 = memberRoleNames.some(
          (r) => r === "r5" || r === "@r5" || matchesRoleKeyword(r, "r5")
        );

        if (!isR5) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⛔ **Access Denied:** Only Alliance Leaders holding the **@R5** role can register alliance servers.",
              flags: 64,
            },
          });
        }

        const mapState = JSON.parse(
          gistData.files["map-state.json"]?.content || "{}"
        );
        const knownAlliances = Object.keys(mapState.alliances || {});

        const matchedAllianceTag = knownAlliances.find((tag) => {
          const cleanTag = tag.toLowerCase();
          return memberRoleNames.some(
            (r) =>
              r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`
          );
        });

        if (!matchedAllianceTag) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ Could not detect your alliance tag role. Ensure you hold your alliance role (e.g. \`@${knownAlliances[0] || "TAG"}\`) in the NAP server.`,
              flags: 64,
            },
          });
        }

        const existingAlliance = mapState.alliances?.[matchedAllianceTag] || {};

        const tokenPayload = {
          alliance: matchedAllianceTag,
          action: "register",
          client_id: clientId,
          color: existingAlliance.color || "#B8975A",
          exp: Date.now() + 24 * 60 * 60 * 1000,
        };
        const token = createHmacToken(tokenPayload, botToken);
        const registerUrl = `https://${resolvedHost}/register.html?token=${token}`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `🤖 Alliance Server Setup — [${matchedAllianceTag}]`,
                color: hexToDiscordColor(existingAlliance.color, 0xb8975a),
                description: `Click below to authorize the bot and link your alliance's Discord server.\n\n• Installs commands (\`/calendar\`, \`/suggest\`, \`/nominate\`, \`/rewards\`, \`/map\`, \`/sb\`, \`/rules\`).\n• Configures alert channels, private R4 ticket routing, and alliance branding.`,
                footer: { text: "Link is private and expires in 24 hours." },
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Open Registration Portal",
                    url: registerUrl,
                  },
                ],
              },
            ],
            flags: 64,
          },
        });
      } catch (err) {
        console.error("Registerbot error:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `⚠️ Service busy: ${err.message}. Please retry in a few moments.`,
            flags: 64,
          },
        });
      }
    }

    // --- /nominate COMMAND ---
    if (name === "nominate") {
      const guildId = interaction.guild_id;
      const member = interaction.member;
      const userId = member?.user?.id || interaction.user?.id;
      const botToken = process.env.DISCORD_BOT_TOKEN;
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;

      const ownerGuildId = (process.env.DISCORD_GUILD_ID_OWNER || "").trim();
      const wloGuildId = (
        process.env.DISCORD_GUILD_ID_WLO ||
        process.env.DISCORD_WLO ||
        ""
      ).trim();

      if (!guildId || !member) {
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
              "⚠️ This command must be executed inside your alliance Discord server.",
            flags: 64,
          },
        });
      }

      if (
        ownerGuildId &&
        guildId === ownerGuildId &&
        userId !== process.env.AUTHORIZED_USER_ID
      ) {
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content:
              "⛔ **Access Denied:** Reward nominations cannot be submitted from this server. Leaders must submit via the NAP server or their alliance server.",
            flags: 64,
          },
        });
      }

      try {
        const memberRoleIds = member.roles || [];
        const [roleMap, gistData] = await Promise.all([
          getGuildRoleMap(guildId, botToken, memberRoleIds),
          getGistData(GIST_ID, GIST_TOKEN),
        ]);

        const memberRoleNames = memberRoleIds
          .map((id) => roleMap.get(id))
          .filter(Boolean);
        const mapState = JSON.parse(
          gistData.files["map-state.json"]?.content || "{}"
        );
        const knownAlliances = Object.keys(mapState.alliances || {});

        let matchedAllianceTag = null;

        let registeredAlliance = Object.entries(mapState.alliances || {}).find(
          ([_, data]) =>
            data?.guild_id && String(data.guild_id).trim() === guildId
        );

        if (!registeredAlliance && wloGuildId && guildId === wloGuildId) {
          registeredAlliance = [
            "WLO",
            { guild_id: wloGuildId, delegated_roles: ["hr", "officer"] },
          ];
        }

        if (registeredAlliance) {
          matchedAllianceTag = registeredAlliance[0];
          const allianceData = registeredAlliance[1] || {};

          const isAdmin = (BigInt(member.permissions || "0") & 8n) === 8n;
          const allowedRoles = [
            "r5",
            ...(allianceData.delegated_roles || ["hr", "officer", "leader"]),
          ];

          const isAuthorized =
            isAdmin ||
            memberRoleNames.some((roleName) =>
              allowedRoles.some((kw) => matchesRoleKeyword(roleName, kw))
            );

          if (!isAuthorized) {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `⛔ **Access Denied:** Only members holding **@R5** or authorized leadership roles (${allowedRoles.map((r) => "@" + r).join(", ")}) can submit nominations for **[${matchedAllianceTag}]**.`,
                flags: 64,
              },
            });
          }
        } else {
          const isR5 = memberRoleNames.some(
            (r) => r === "r5" || r === "@r5" || matchesRoleKeyword(r, "r5")
          );
          if (!isR5 && userId !== process.env.AUTHORIZED_USER_ID) {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  "⛔ **Access Denied:** Only Alliance Leaders holding the **@r5** role can submit reward nominations.",
                flags: 64,
              },
            });
          }

          matchedAllianceTag = knownAlliances.find((tag) => {
            const cleanTag = tag.toLowerCase();
            return memberRoleNames.some(
              (r) =>
                r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`
            );
          });

          if (!matchedAllianceTag) {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `⚠️ Could not detect your alliance tag role. Make sure you have your alliance role (e.g. \`@${knownAlliances[0] || "TAG"}\`) assigned.`,
                flags: 64,
              },
            });
          }
        }

        const rewardsData = JSON.parse(
          gistData.files["rewards-data.json"]?.content || "{}"
        );
        const isKW = rewardsData.mode === "kw";

        const allianceInfo = mapState.alliances[matchedAllianceTag];
        const rank = parseInt(allianceInfo?.rank, 10);

        if (isNaN(rank)) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ **[${matchedAllianceTag}]** does not have an active rank assigned.`,
              flags: 64,
            },
          });
        }

        const tiers = rewardsData.distribution_tiers || [];
        const matchedTier = tiers.find((tier) => {
          const min = parseInt(tier.min_rank ?? tier.minRank, 10);
          const max = parseInt(tier.max_rank ?? tier.maxRank, 10);
          return !isNaN(min) && !isNaN(max) && rank >= min && rank <= max;
        });

        if (!matchedTier) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ **[${matchedAllianceTag}]** (Rank${rank}) is not currently eligible for rewards under the active plan.`,
              flags: 64,
            },
          });
        }

        const allotment = matchedTier.chests || {
          commanders_will: 0,
          loyal_servant: 0,
          followers_heart: 0,
        };
        const singleQuota =
          (allotment.commanders_will || 0) +
          (allotment.loyal_servant || 0) +
          (allotment.followers_heart || 0);

        if (singleQuota === 0) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ **[${matchedAllianceTag}]** has 0 chests allocated under the current distribution.`,
              flags: 64,
            },
          });
        }

        const totalChests = isKW ? singleQuota * 2 : singleQuota;

        const tokenPayload = {
          alliance: matchedAllianceTag,
          rank: rank,
          allotment: allotment,
          mode: isKW ? "kw" : "standard",
          exp: Date.now() + 24 * 60 * 60 * 1000,
        };
        const token = createHmacToken(tokenPayload, botToken);
        const nominateUrl = `https://${resolvedHost}/nominate.html?token=${token}`;

        const fields = [
          {
            name: "🟡 Gold (Commander)",
            value: `×${allotment.commanders_will || 0}`,
            inline: true,
          },
          {
            name: "🟣 Purple (Servant)",
            value: `×${allotment.loyal_servant || 0}`,
            inline: true,
          },
          {
            name: "🔵 Blue (Follower)",
            value: `×${allotment.followers_heart || 0}`,
            inline: true,
          },
        ];

        if (isKW) {
          fields.push({
            name: "⚔️ Kingdom War Split Pool",
            value: `You will submit **two separate rosters** of the above quantities:\n1× **Regular Pool** (${singleQuota} chests)\n1× **Kingdom War Pool** (${singleQuota} chests)`,
            inline: false,
          });
        }

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `🎁 Reward Nominations — [${matchedAllianceTag}]${isKW ? " ⚔️ [KW 2x Active]" : ""}`,
                color: isKW
                  ? 0x8f0000
                  : hexToDiscordColor(allianceInfo?.color, 0xb8975a),
                description: `You are eligible for **${totalChests} total chests** based on your **Rank ${rank}** finish.\nClick below to submit your recipient roster.`,
                fields: fields,
                footer: { text: "Link is private and expires in 24 hours." },
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: isKW
                      ? "Open 2x Nomination Portal"
                      : "Open Nomination Portal",
                    url: nominateUrl,
                  },
                ],
              },
            ],
            flags: 64,
          },
        });
      } catch (err) {
        console.error("Nominate error:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `⚠️ Connection busy: ${err.message}. Please retry in a few seconds.`,
            flags: 64,
          },
        });
      }
    }

    // --- /rewards COMMAND ---
    if (name === "rewards") {
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;
      const userId = interaction.member?.user?.id || interaction.user?.id;
      const username =
        interaction.member?.nick ||
        interaction.member?.user?.global_name ||
        interaction.member?.user?.username ||
        interaction.user?.global_name ||
        interaction.user?.username ||
        "Leadership";

      const requestedAction = options?.find(
        (opt) => opt.name === "action"
      )?.value;
      const requestedMode =
        options?.find((opt) => opt.name === "mode")?.value || "standard";

      if (requestedAction === "reset") {
        if (userId !== process.env.AUTHORIZED_USER_ID) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⛔ **Access Denied:** Only authorized leadership can reset reward nomination cycles.",
              flags: 64,
            },
          });
        }

        try {
          const gistData = await getGistData(GIST_ID, GIST_TOKEN);
          const currentRewards = JSON.parse(
            gistData.files["rewards-data.json"]?.content || "{}"
          );
          currentRewards.mode = requestedMode;
          currentRewards.lastReset = new Date().toISOString();

          const patchRes = await fetch(
            `https://api.github.com/gists/${GIST_ID}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${GIST_TOKEN}`,
                "Content-Type": "application/json",
                "User-Agent": "WarRoom-App",
              },
              body: JSON.stringify({
                description: `Cycle reset (${requestedMode}) by ${username} at${new Date().toISOString()}`,
                files: {
                  "rewards-nominations.json": {
                    content: JSON.stringify({}, null, 2),
                  },
                  "rewards-data.json": {
                    content: JSON.stringify(currentRewards, null, 2),
                  },
                },
              }),
            }
          );

          if (!patchRes.ok)
            throw new Error(`GitHub API returned ${patchRes.status}`);

          const isKW = requestedMode === "kw";
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: isKW
                    ? "⚔️ Kingdom War Cycle Initialized (2x Rewards)"
                    : "🔄 Standard Reward Cycle Reset",
                  color: isKW ? 0x8f0000 : 0x22c55e,
                  description: `All previous nominations have been cleared from Kingdom records.\n\n• **Active Mode:** ${isKW ? "⚔️ **Kingdom War (Double Allocation: 1x Regular + 1x KW)**" : "🛡️ **Standard Week (1x Allocation)**"}\n• All eligible alliances are reset to \`⏳ Awaiting submission\`.\n• Leaders can now generate fresh rosters via \`/nominate\`.\n• Remind the King to hit **Reset Checklist** on the console.`,
                  footer: { text: `Cycle initialized by ${username}` },
                  timestamp: new Date().toISOString(),
                },
              ],
            },
          });
        } catch (err) {
          console.error("Rewards reset error:", err);
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Failed to reset cycle: ${err.message}`,
              flags: 64,
            },
          });
        }
      }

      try {
        const gistData = await getGistData(GIST_ID, GIST_TOKEN);
        const mapState = JSON.parse(
          gistData.files["map-state.json"]?.content || "{}"
        );
        const rewardsData = JSON.parse(
          gistData.files["rewards-data.json"]?.content || "{}"
        );
        const nominations = JSON.parse(
          gistData.files["rewards-nominations.json"]?.content || "{}"
        );

        const isKW = rewardsData.mode === "kw";
        const tiers = rewardsData.distribution_tiers || [];
        const alliances = mapState.alliances || {};

        const eligibleRoster = [];

        Object.entries(alliances).forEach(([tag, data]) => {
          const rank = parseInt(data.rank, 10);
          if (isNaN(rank)) return;

          const matchedTier = tiers.find((tier) => {
            const min = parseInt(tier.min_rank ?? tier.minRank, 10);
            const max = parseInt(tier.max_rank ?? tier.maxRank, 10);
            return !isNaN(min) && !isNaN(max) && rank >= min && rank <= max;
          });
          if (!matchedTier) return;

          const allotment = matchedTier.chests || {};
          const singleTotal =
            (allotment.commanders_will || 0) +
            (allotment.loyal_servant || 0) +
            (allotment.followers_heart || 0);

          if (singleTotal > 0) {
            eligibleRoster.push({
              tag,
              rank,
              quota: isKW ? singleTotal * 2 : singleTotal,
            });
          }
        });

        eligibleRoster.sort((a, b) => a.rank - b.rank);

        if (eligibleRoster.length === 0) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⚠️ No alliances are currently eligible under the active rewards plan.",
              flags: 64,
            },
          });
        }

        let submittedCount = 0;
        const statusLines = eligibleRoster.map((item) => {
          const entry = nominations[item.tag];
          if (entry && entry.recipients) {
            submittedCount++;
            let totalNominated = 0;

            if (entry.recipients.standard) {
              totalNominated +=
                (entry.recipients.standard.commanders_will?.length || 0) +
                (entry.recipients.standard.loyal_servant?.length || 0) +
                (entry.recipients.standard.followers_heart?.length || 0);
              if (entry.recipients.kingdom_war) {
                totalNominated +=
                  (entry.recipients.kingdom_war.commanders_will?.length || 0) +
                  (entry.recipients.kingdom_war.loyal_servant?.length || 0) +
                  (entry.recipients.kingdom_war.followers_heart?.length || 0);
              }
            } else {
              totalNominated =
                (entry.recipients.commanders_will?.length || 0) +
                (entry.recipients.loyal_servant?.length || 0) +
                (entry.recipients.followers_heart?.length || 0);
            }

            const submitUnix = Math.floor(
              new Date(entry.submittedAt).getTime() / 1000
            );
            return `✅ **[${item.tag}]** (Rank${item.rank}) — **${totalNominated}/${item.quota}** nominated (<t:${submitUnix}:R>)`;
          } else {
            return `⏳ **[${item.tag}]** (Rank ${item.rank}) — **Awaiting submission** (${item.quota} chests)`;
          }
        });

        const isComplete = submittedCount === eligibleRoster.length;
        const modeBadge = isKW ? "⚔️ Kingdom War (2x Split)" : "🛡️ Standard";

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `📋 Alliance Reward Status — ${modeBadge}`,
                color: isKW ? 0x8f0000 : isComplete ? 0x22c55e : 0xb8975a,
                description: `**${submittedCount} of ${eligibleRoster.length} Alliances Submitted**\n\n${statusLines.join("\n")}`,
                footer: { text: "Last Asylum Capitol Administration" },
                timestamp: new Date().toISOString(),
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Open King's Console",
                    url: `https://${resolvedHost}/distribute.html`,
                  },
                ],
              },
            ],
          },
        });
      } catch (err) {
        console.error("Rewards status error:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `⚠️ Connection busy: ${err.message}. Please retry in a few seconds.`,
            flags: 64,
          },
        });
      }
    }

    // --- /rank COMMAND ---
    if (name === "rank") {
      const sub = options?.[0];

      if (sub?.name === "list") {
        try {
          const ranks = await listAllianceRanks();
          const desc = ranks.length
            ? ranks.map((a) => `**#${a.rank}** — \`[${a.tag}]\``).join("\n")
            : "No alliances registered in current state.";

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: "🛡️ Server NAP Standings",
                  color: 0xb8975a,
                  description: desc,
                  footer: { text: "Last Asylum Kingdom Standings" },
                },
              ],
            },
          });
        } catch (err) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ Failed to fetch rankings: ${err.message}`,
              flags: 64,
            },
          });
        }
      }

      if (sub?.name === "set") {
        const userId = interaction.member?.user?.id || interaction.user?.id;

        if (userId !== process.env.AUTHORIZED_USER_ID) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⛔ **Access Denied:** Only authorized administrators can update alliance rankings.",
              flags: 64,
            },
          });
        }

        const tagOption = sub.options?.find((o) => o.name === "tag");
        const rankOption = sub.options?.find((o) => o.name === "rank");

        if (!tagOption || !rankOption) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "⚠️ Missing required arguments: tag and rank.",
              flags: 64,
            },
          });
        }

        const author =
          interaction.member?.nick ||
          interaction.member?.user?.global_name ||
          interaction.member?.user?.username ||
          interaction.user?.global_name ||
          interaction.user?.username ||
          "Leadership";

        try {
          const result = await setAllianceRank({
            tag: tagOption.value,
            rank: rankOption.value,
            updatedBy: author,
          });

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `👑 **NAP Standing Updated:** \`[${result.tag}]\` is now **#${result.newRank}** (was: ${result.previousRank}).`,
            },
          });
        } catch (err) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ Failed to update rank: ${err.message}`,
              flags: 64,
            },
          });
        }
      }
    }
  }

  // =========================================================================
  // 2. MODAL SUBMIT HANDLING (TYPE 5 — /suggest & Officer Close Note)
  // =========================================================================
  if (interaction.type === 5) {
    const { custom_id, components } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const username =
      interaction.member?.nick ||
      interaction.member?.user?.global_name ||
      interaction.member?.user?.username ||
      interaction.user?.global_name ||
      interaction.user?.username ||
      "Member";

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const GIST_ID = process.env.GIST_ID;
    const GIST_TOKEN = process.env.GIST_TOKEN;

    const getFieldVal = (id) => {
      for (const row of components || []) {
        for (const comp of row.components || []) {
          if (comp.custom_id === id) return (comp.value || "").trim();
        }
      }
      return "";
    };

    // --- MODAL A: Player Submits New Suggestion / Alliance Ticket ---
    if (custom_id && custom_id.startsWith("suggest_modal:")) {
      const [, ticketType, allianceTag] = custom_id.split(":");
      const title = getFieldVal("sug_title");
      const problem = getFieldVal("sug_problem");
      const solution = getFieldVal("sug_solution") || null;

      try {
        const gistData = await getGistData(GIST_ID, GIST_TOKEN);
        const mapState = JSON.parse(
          gistData.files?.["map-state.json"]?.content || "{}"
        );
        const suggestionsRaw =
          gistData.files?.["suggestions-state.json"]?.content;
        const suggestionsState = suggestionsRaw
          ? JSON.parse(suggestionsRaw)
          : { next_ticket_id: 1, suggestions: [] };

        applyTicketRetentionPolicy(suggestionsState);

        const allianceData = mapState.alliances?.[allianceTag];
        if (!allianceData || !allianceData.officer_channel_id) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ Officer intake channel is not configured for **[${allianceTag}]**.`,
              flags: 64,
            },
          });
        }

        // Re-verify active concurrency cap (max 2)
        const activeCount = (suggestionsState.suggestions || []).filter(
          (s) =>
            s.author_id === userId &&
            (s.status === "pending_alliance" || s.status === "in_discussion")
        ).length;

        if (activeCount >= 2) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "⚠️ You already have 2 active tickets open. Please wait for leadership to resolve one first.",
              flags: 64,
            },
          });
        }

        const ticketId = suggestionsState.next_ticket_id || 1;
        suggestionsState.next_ticket_id = ticketId + 1;

        const nowIso = new Date().toISOString();
        const expiresIso = new Date(
          Date.now() + 30 * 86400 * 1000
        ).toISOString();

        const newTicket = {
          id: ticketId,
          type: ticketType, // 'nap_proposal' | 'alliance_issue'
          alliance: allianceTag,
          author_id: userId,
          author_tag: username,
          title,
          problem,
          solution,
          status: "pending_alliance",
          resolution_note: null,
          officer_vouched_by: null,
          channel_id: allianceData.officer_channel_id,
          message_id: null,
          thread_id: null,
          extended: false,
          nudge_sent: false,
          created_at: nowIso,
          expires_at: expiresIso,
          closed_at: null,
        };

        // Post Triage Card to Alliance Officer Channel
        const triagePayload = buildTriageCardPayload(
          newTicket,
          allianceData.color
        );

        const postRes = await fetch(
          `https://discord.com/api/v10/channels/${allianceData.officer_channel_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(triagePayload),
          }
        );

        if (!postRes.ok) {
          const errText = await postRes.text();
          console.error("Failed to post triage card:", errText);
          throw new Error(
            "Could not post to your alliance's officer channel. Verify bot permissions."
          );
        }

        const postedMsg = await postRes.json();
        newTicket.message_id = postedMsg.id;

        suggestionsState.suggestions.push(newTicket);
        await patchGistFile(
          GIST_ID,
          GIST_TOKEN,
          "suggestions-state.json",
          suggestionsState,
          `Ticket #${ticketId} submitted by ${username} ([${allianceTag}])`
        );

        const isNap = ticketType === "nap_proposal";
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `✅ Ticket #${ticketId} Submitted to [${allianceTag}] Leadership`,
                color: hexToDiscordColor(allianceData.color, 0x22c55e),
                description: `Your **${isNap ? "Kingdom / NAP Proposal" : "Internal Alliance Issue"}** (*"${title}"*) has been routed to your alliance officers for review.\n\n💡 *You can check its status and officer notes anytime by running \`/suggest\` and selecting **View My Ticket Status**.*`,
              },
            ],
            flags: 64,
          },
        });
      } catch (err) {
        console.error("Modal submit error:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Submission failed: ${err.message}`,
            flags: 64,
          },
        });
      }
    }

    // --- MODAL B: Officer Closes Ticket (Resolve or Decline with Optional Note) ---
    if (custom_id && custom_id.startsWith("tkt_close_modal:")) {
      const [, closeAction, rawTicketId] = custom_id.split(":");
      const ticketId = parseInt(rawTicketId, 10);
      const customNote = getFieldVal("close_note");

      try {
        const gistData = await getGistData(GIST_ID, GIST_TOKEN);
        const mapState = JSON.parse(
          gistData.files?.["map-state.json"]?.content || "{}"
        );
        const suggestionsState = JSON.parse(
          gistData.files?.["suggestions-state.json"]?.content ||
            '{"next_ticket_id":1,"suggestions":[]}'
        );

        const ticket = (suggestionsState.suggestions || []).find(
          (s) => s.id === ticketId
        );
        if (!ticket) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "⚠️ Ticket not found.", flags: 64 },
          });
        }

        const isResolve = closeAction === "resolve";
        ticket.status = isResolve ? "resolved" : "declined";
        ticket.officer_vouched_by = username;
        ticket.closed_at = new Date().toISOString();
        ticket.resolution_note =
          customNote ||
          (isResolve
            ? "Resolved by alliance leadership."
            : "Reviewed and declined by alliance leadership.");

        await patchGistFile(
          GIST_ID,
          GIST_TOKEN,
          "suggestions-state.json",
          suggestionsState,
          `Ticket #${ticketId} ${ticket.status} by ${username}`
        );

        const allianceColor = mapState.alliances?.[ticket.alliance]?.color;
        const updatedCard = buildTriageCardPayload(ticket, allianceColor);

        // Update original triage card in #officer-intake
        if (ticket.channel_id && ticket.message_id) {
          await fetch(
            `https://discord.com/api/v10/channels/${ticket.channel_id}/messages/${ticket.message_id}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(updatedCard),
            }
          ).catch(() => {});
        }

        // Safely archive discussion thread if one was opened
        if (ticket.thread_id) {
          await fetch(
            `https://discord.com/api/v10/channels/${ticket.thread_id}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                content: `${isResolve ? "✅ **Ticket Resolved**" : "❌ **Ticket Declined**"} by **${username}**.\n> 📝 **Note:** ${ticket.resolution_note}\n*This thread is now archived.*`,
              }),
            }
          ).catch(() => {});

          await safeArchiveThread(ticket.thread_id, botToken);
        }

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `${isResolve ? "✅" : "❌"} **Ticket #${ticketId}** has been marked as **${isResolve ? "Resolved" : "Declined"}**.`,
            flags: 64,
          },
        });
      } catch (err) {
        console.error("Close ticket modal error:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Failed to update ticket: ${err.message}`,
            flags: 64,
          },
        });
      }
    }
  }

  // =========================================================================
  // 3. BUTTON INTERACTIONS (TYPE 3 — Map Switcher, Ticket Triage & Admin)
  // =========================================================================
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const rawHost =
      req.headers["x-forwarded-host"] || req.headers.host || "la-s78.app";
    const resolvedHost = rawHost.split(",")[0].trim();
    const lang = resolveUserLocale(interaction, null);
    const t = getBotStrings(lang);

    // --- 3A. PUBLIC MAP VIEW SWITCH BUTTONS ---
    if (custom_id && custom_id.startsWith("map_view:")) {
      const targetView = custom_id.replace("map_view:", "");
      const revision = await getLatestMapRevision(
        process.env.GIST_ID,
        process.env.GIST_TOKEN
      );
      const payload = buildMapMessagePayload({
        view: targetView,
        revision,
        resolvedHost,
        lang,
        t,
      });

      return res.status(200).json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: payload,
      });
    }

    // --- 3B. OFFICER TICKET TRIAGE BUTTONS (tkt_*) ---
    if (custom_id && custom_id.startsWith("tkt_")) {
      const [actionKey, rawTicketId] = custom_id.split(":");
      const ticketId = parseInt(rawTicketId, 10);
      const guildId = interaction.guild_id;
      const member = interaction.member;
      const userId = member?.user?.id || interaction.user?.id;
      const username =
        member?.nick ||
        member?.user?.global_name ||
        member?.user?.username ||
        interaction.user?.global_name ||
        interaction.user?.username ||
        "Officer";

      const botToken = process.env.DISCORD_BOT_TOKEN;
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;

      try {
        const [roleMap, gistData] = await Promise.all([
          getGuildRoleMap(guildId, botToken, member?.roles || []),
          getGistData(GIST_ID, GIST_TOKEN),
        ]);

        const mapState = JSON.parse(
          gistData.files?.["map-state.json"]?.content || "{}"
        );
        const suggestionsState = JSON.parse(
          gistData.files?.["suggestions-state.json"]?.content ||
            '{"next_ticket_id":1,"suggestions":[]}'
        );

        const ticket = (suggestionsState.suggestions || []).find(
          (s) => s.id === ticketId
        );
        if (!ticket) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "⚠️ Ticket record not found.", flags: 64 },
          });
        }

        const allianceData = mapState.alliances?.[ticket.alliance] || {};
        const memberRoleNames = (member?.roles || [])
          .map((id) => roleMap.get(id))
          .filter(Boolean);

        const isAdmin = (BigInt(member?.permissions || "0") & 8n) === 8n;
        const allowedRoles = [
          "r5",
          ...(allianceData.delegated_roles || ["hr", "officer", "leader"]),
        ];
        const isAuthorizedOfficer =
          userId === process.env.AUTHORIZED_USER_ID ||
          isAdmin ||
          memberRoleNames.some((roleName) =>
            allowedRoles.some((kw) => matchesRoleKeyword(roleName, kw))
          );

        if (!isAuthorizedOfficer) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⛔ **Access Denied:** Only **@R5** or authorized leadership roles (${allowedRoles.map((r) => "@" + r).join(", ")}) can triage tickets.`,
              flags: 64,
            },
          });
        }

        // 1. RESOLVE or DECLINE -> Pop 1-Field Modal for Optional Note
        if (actionKey === "tkt_resolve" || actionKey === "tkt_decline") {
          const isResolve = actionKey === "tkt_resolve";
          return res.status(200).json({
            type: 9, // MODAL
            data: {
              custom_id: `tkt_close_modal:${isResolve ? "resolve" : "decline"}:${ticket.id}`,
              title: isResolve
                ? `✅ Resolve Ticket #${ticket.id}`
                : `❌ Decline Ticket #${ticket.id}`,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 4,
                      custom_id: "close_note",
                      label: "Note for Submitter (Optional)",
                      style: 2,
                      max_length: 300,
                      placeholder: isResolve
                        ? "Optional: e.g., Addressed! We will adjust the schedule starting Friday."
                        : "Optional: e.g., Covered by NAP Rule 4 / Not feasible during KW.",
                      required: false,
                    },
                  ],
                },
              ],
            },
          });
        }

        // 2. ENDORSE TO NAP -> Forward Anonymously to Central NAP Channel
        if (actionKey === "tkt_endorse") {
          if (ticket.type !== "nap_proposal") {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  "⚠️ Internal alliance tickets cannot be escalated to the NAP Council.",
                flags: 64,
              },
            });
          }

          const napChannelId = (
            process.env.WAR_ROOM_CHANNEL_ID ||
            process.env.REWARDS_CHANNEL_ID ||
            mapState.nap_channel_id ||
            ""
          ).trim();

          if (!napChannelId) {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  "⚠️ Central NAP Council channel ID is not configured (`WAR_ROOM_CHANNEL_ID` / `REWARDS_CHANNEL_ID`).",
                flags: 64,
              },
            });
          }

          // Post to NAP Council with Alliance Brand Color & "Kingdom Shield" Anonymity
          const councilEmbed = {
            title: `👑 Council Proposal #${ticket.id} — ${ticket.title}`,
            color: hexToDiscordColor(allianceData.color, 0xb8975a),
            description: `🛡️ **Sponsored & Endorsed by [${ticket.alliance}] Leadership** *(Vouched by ${username})*`,
            fields: [
              {
                name: "⚠️ Observed Issue / Friction",
                value: ticket.problem,
                inline: false,
              },
              {
                name: "💡 Proposed Solution",
                value:
                  ticket.solution ||
                  "*Open for Kingdom Council deliberation*",
                inline: false,
              },
            ],
            footer: {
              text: `Sponsored by [${ticket.alliance}] • Proposal #${ticket.id}`,
            },
            timestamp: new Date().toISOString(),
          };

          const napPostRes = await fetch(
            `https://discord.com/api/v10/channels/${napChannelId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ embeds: [councilEmbed] }),
            }
          );

          if (!napPostRes.ok) {
            throw new Error(
              `Failed to post to NAP Council channel (${napPostRes.status}).`
            );
          }

          ticket.status = "endorsed_to_council";
          ticket.officer_vouched_by = username;
          ticket.closed_at = new Date().toISOString();
          ticket.resolution_note = `Endorsed by [${ticket.alliance}] Leadership (${username}) and forwarded to the Kingdom Council.`;

          await patchGistFile(
            GIST_ID,
            GIST_TOKEN,
            "suggestions-state.json",
            suggestionsState,
            `Ticket #${ticket.id} endorsed to NAP by ${username}`
          );

          const updatedCard = buildTriageCardPayload(
            ticket,
            allianceData.color
          );

          if (ticket.channel_id && ticket.message_id) {
            await fetch(
              `https://discord.com/api/v10/channels/${ticket.channel_id}/messages/${ticket.message_id}`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bot ${botToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(updatedCard),
              }
            ).catch(() => {});
          }

          if (ticket.thread_id) {
            await safeArchiveThread(ticket.thread_id, botToken);
          }

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `🚀 **Proposal #${ticket.id}** has been officially endorsed on behalf of **[${ticket.alliance}]** and posted to the NAP Council!`,
              flags: 64,
            },
          });
        }

        // 3. MANAGE -> Spawn Discussion Thread under Triage Card
        if (actionKey === "tkt_manage") {
          if (ticket.thread_id) {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `💬 A discussion thread is already open: <#${ticket.thread_id}>`,
                flags: 64,
              },
            });
          }

          const threadRes = await fetch(
            `https://discord.com/api/v10/channels/${interaction.channel_id}/messages/${interaction.message.id}/threads`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: `Ticket #${ticket.id} — ${ticket.title.slice(0, 45)}`,
                auto_archive_duration: 1440,
              }),
            }
          );

          if (!threadRes.ok) {
            const errTxt = await threadRes.text();
            console.error("Thread creation failed:", errTxt);
            throw new Error(
              "Could not create thread. Ensure the bot has 'Create Public/Private Threads' permissions."
            );
          }

          const threadData = await threadRes.json();
          ticket.thread_id = threadData.id;

          await patchGistFile(
            GIST_ID,
            GIST_TOKEN,
            "suggestions-state.json",
            suggestionsState,
            `Manage thread opened for Ticket #${ticket.id}`
          );

          const isNap = ticket.type === "nap_proposal";

          // Post Officer Control Panel inside the new thread
          await fetch(
            `https://discord.com/api/v10/channels/${threadData.id}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                embeds: [
                  {
                    title: `🛠️ Officer Deliberation — Ticket #${ticket.id}`,
                    color: hexToDiscordColor(allianceData.color, 0xb8975a),
                    description: `Thread opened by **${username}**.\n\n• Discuss internally here (hidden from the submitter by default).\n• Click **Discuss with Submitter** below if you want to invite <@${ticket.author_id}> into this thread for Q&A.`,
                  },
                ],
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        style: 1,
                        label: "Discuss with Submitter",
                        custom_id: `tkt_discuss:${ticket.id}`,
                        emoji: { name: "💬" },
                        disabled: !ticket.author_id,
                      },
                      {
                        type: 2,
                        style: 2,
                        label: "Extend (+14 Days)",
                        custom_id: `tkt_extend:${ticket.id}`,
                        emoji: { name: "⏳" },
                        disabled: Boolean(ticket.extended),
                      },
                      isNap
                        ? {
                            type: 2,
                            style: 3,
                            label: "Endorse to NAP",
                            custom_id: `tkt_endorse:${ticket.id}`,
                            emoji: { name: "🚀" },
                          }
                        : {
                            type: 2,
                            style: 3,
                            label: "Resolve",
                            custom_id: `tkt_resolve:${ticket.id}`,
                            emoji: { name: "✅" },
                          },
                      {
                        type: 2,
                        style: 4,
                        label: "Decline",
                        custom_id: `tkt_decline:${ticket.id}`,
                        emoji: { name: "❌" },
                      },
                    ],
                  },
                ],
              }),
            }
          );

          const updatedCard = buildTriageCardPayload(
            ticket,
            allianceData.color
          );
          return res.status(200).json({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: updatedCard,
          });
        }

        // 4. DISCUSS WITH SUBMITTER -> Add Submitter to Thread
        if (actionKey === "tkt_discuss") {
          const targetThreadId = ticket.thread_id || interaction.channel_id;
          if (!ticket.author_id) {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  "⚠️ Submitter identity has already been anonymized.",
                flags: 64,
              },
            });
          }

          await fetch(
            `https://discord.com/api/v10/channels/${targetThreadId}/thread-members/${ticket.author_id}`,
            {
              method: "PUT",
              headers: { Authorization: `Bot ${botToken}` },
            }
          ).catch(() => {});

          ticket.status = "in_discussion";
          await patchGistFile(
            GIST_ID,
            GIST_TOKEN,
            "suggestions-state.json",
            suggestionsState,
            `Submitter invited to Ticket #${ticket.id}`
          );

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `💬 <@${ticket.author_id}> — You have been invited by **${username}** to discuss **Ticket #${ticket.id}** (*"${ticket.title}"*) with **[${ticket.alliance}]** leadership.`,
            },
          });
        }

        // 5. EXTEND (+14 DAYS) -> One-Time Deadline Extension
        if (actionKey === "tkt_extend") {
          if (ticket.extended) {
            return res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  "⚠️ This ticket has already received its one-time 14-day extension.",
                flags: 64,
              },
            });
          }

          const currentExpiryMs = ticket.expires_at
            ? new Date(ticket.expires_at).getTime()
            : Date.now() + 30 * 86400 * 1000;

          ticket.extended = true;
          ticket.expires_at = new Date(
            currentExpiryMs + 14 * 86400 * 1000
          ).toISOString();

          await patchGistFile(
            GIST_ID,
            GIST_TOKEN,
            "suggestions-state.json",
            suggestionsState,
            `Ticket #${ticket.id} extended +14d by ${username}`
          );

          const newExpUnix = Math.floor(
            new Date(ticket.expires_at).getTime() / 1000
          );
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⏳ **Ticket #${ticket.id} Extended:** Deliberation window extended by 14 days by **${username}** (New expiry: <t:${newExpUnix}:D>).`,
            },
          });
        }
      } catch (err) {
        console.error("Ticket button error:", err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Action failed: ${err.message}`,
            flags: 64,
          },
        });
      }
    }

    // --- 3C. ADMIN PROPOSALS & REVIEWS (Protected by AUTHORIZED_USER_ID) ---
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const username =
      interaction.member?.nick ||
      interaction.member?.user?.global_name ||
      interaction.member?.user?.username ||
      interaction.user?.global_name ||
      interaction.user?.username ||
      "Discord Admin";

    if (userId !== process.env.AUTHORIZED_USER_ID) {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: t.admin.access_denied, flags: 64 },
      });
    }

    const isRewardProposal = custom_id.includes("reward");
    const isApproved =
      custom_id === "approve_proposal" ||
      custom_id === "approve_reward_proposal";

    if (isApproved) {
      try {
        const filePrefix = isRewardProposal
          ? "reward-blueprint"
          : "strategy-blueprint";
        const blueprintAttachment = interaction.message.attachments?.find((a) =>
          a.filename.startsWith(filePrefix)
        );

        if (!blueprintAttachment)
          throw new Error(`${filePrefix} blueprint data is missing.`);

        const blueprintRes = await fetch(blueprintAttachment.url);
        if (!blueprintRes.ok)
          throw new Error("Failed to retrieve blueprint data.");
        const parsedData = await blueprintRes.json();

        const acceptPayload = isRewardProposal
          ? {
              type: "rewards",
              distribution: parsedData,
              submittedBy: username,
              secretKey: process.env.DISCORD_BOT_TOKEN,
            }
          : {
              changes: parsedData,
              submittedBy: username,
              secretKey: process.env.DISCORD_BOT_TOKEN,
            };

        const acceptRes = await fetch(
          `https://${resolvedHost}/api/accept-proposal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(acceptPayload),
          }
        );

        const acceptJson = await acceptRes.json().catch(() => ({}));
        if (!acceptRes.ok) {
          throw new Error(
            acceptJson.error || `Server responded with ${acceptRes.status}`
          );
        }

        if (acceptJson.revision) {
          mapRevisionCache.revision = acceptJson.revision;
          mapRevisionCache.timestamp = Date.now();
        }
      } catch (error) {
        console.error("Interaction bridge failed:", error);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ **${t.admin.failed_update}** ${error.message}`,
            flags: 64,
          },
        });
      }
    }

    const originalEmbed = JSON.parse(
      JSON.stringify(interaction.message.embeds[0])
    );
    originalEmbed.color = isApproved ? 0x22c55e : 0xef4444;

    const statusIndex = originalEmbed.fields.findIndex((f) =>
      f.name.toLowerCase().includes("status")
    );
    const statusField = {
      name: "⚖️ Status",
      value: isApproved
        ? `✅ **Approved by ${username}**`
        : `❌ **Rejected by ${username}**`,
      inline: false,
    };

    if (statusIndex !== -1) {
      originalEmbed.fields[statusIndex] = statusField;
    } else {
      originalEmbed.fields.push(statusField);
    }

    const approveId = isRewardProposal
      ? "approve_reward_proposal"
      : "approve_proposal";
    const rejectId = isRewardProposal
      ? "reject_reward_proposal"
      : "reject_proposal";

    return res.status(200).json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [originalEmbed],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: approveId,
                label: isApproved ? "Approved" : "Approve",
                style: 3,
                disabled: true,
              },
              {
                type: 2,
                custom_id: rejectId,
                label: !isApproved ? "Rejected" : "Reject",
                style: 4,
                disabled: true,
              },
            ],
          },
        ],
      },
    });
  }

  return res.status(400).end();
}