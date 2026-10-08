// api/interactions.js
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
    description: "View or manage the Event Calendar",
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
    },
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
  const regex = new RegExp(
    `(^|\\s|_|-)${cleanKey}(\\s\vert{}_\vert{}-\vert{}$)`,
    "i",
  );
  return regex.test(cleanRole);
}

async function getGistData(gistId, gistToken) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${gistToken}`,
      "User-Agent": "WarRoom-App",
    },
    signal: AbortSignal.timeout(2200),
  });

  if (!res.ok) throw new Error(`GitHub Gist error (${res.status})`);
  return res.json();
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

  // --- SLASH COMMAND HANDLING ---
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const rawHost =
      req.headers["x-forwarded-host"] || req.headers.host || "la-s78.app";
    const resolvedHost = rawHost.split(",")[0].trim();
    const providedLang = options?.find((opt) => opt.name === "lang")?.value;
    const lang = resolveUserLocale(interaction, providedLang);
    const t = getBotStrings(lang);

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

      const requestedAction = options?.find(
        (opt) => opt.name === "action",
      )?.value;

      let calConfig = DEFAULT_CALENDAR_CONFIG;
      let alliances = {};

      try {
        if (GIST_ID && GIST_TOKEN) {
          const gistData = await getCachedCalendarGist(GIST_ID, GIST_TOKEN);
          const calRaw = gistData.files?.["calendar-state.json"]?.content;
          const mapRaw = gistData.files?.["map-state.json"]?.content;

          if (calRaw) calConfig = { ...calConfig, ...JSON.parse(calRaw) };
          if (mapRaw) alliances = JSON.parse(mapRaw).alliances || {};
        }
      } catch (err) {
        console.warn(
          "Calendar state fetch failed, utilizing defaults:",
          err.message,
        );
      }

      // 1. Resolve caller alliance tag from Guild ID or NAP Server Roles
      let detectedAllianceTag = null;
      let memberRoleNames = [];

      try {
        const memberRoleIds = member?.roles || [];
        if (guildId && botToken && memberRoleIds.length > 0) {
          const roleMap = await getGuildRoleMap(
            guildId,
            botToken,
            memberRoleIds,
          );
          memberRoleNames = memberRoleIds
            .map((id) => roleMap.get(id))
            .filter(Boolean);
        }

        // Check if inside a registered alliance server
        const registeredEntry = Object.entries(alliances).find(
          ([_, data]) =>
            data?.guild_id && String(data.guild_id).trim() === guildId,
        );

        if (registeredEntry) {
          detectedAllianceTag = registeredEntry[0];
        } else if (napGuildId && guildId === napGuildId) {
          // Check for alliance tag role in NAP server
          const knownTags = Object.keys(alliances);
          detectedAllianceTag = knownTags.find((tag) => {
            const cleanTag = tag.toLowerCase();
            return memberRoleNames.some(
              (r) =>
                r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`,
            );
          });
        }
      } catch (err) {
        console.warn("Failed to resolve caller alliance context:", err.message);
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
          exp: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
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
                  "Click below to open the War Room calendar in **Global Management Mode**.\n\nYou can schedule kingdom-wide announcements, truce alerts, or delete entries.",
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

        const allianceData = alliances[detectedAllianceTag] || {};
        const isAdmin = (BigInt(member?.permissions || "0") & 8n) === 8n;
        const allowedRoles = [
          "r5",
          ...(allianceData.delegated_roles || ["hr", "officer", "leader"]),
        ];
        const isAuthorized =
          userId === process.env.AUTHORIZED_USER_ID ||
          isAdmin ||
          memberRoleNames.some((roleName) =>
            allowedRoles.some((kw) => matchesRoleKeyword(roleName, kw)),
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
          exp: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
        };
        const token = createHmacToken(tokenPayload, botToken);
        const manageUrl = `https://${resolvedHost}/calendar.html?token=${token}`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `🛡️ Alliance Event Management — [${detectedAllianceTag}]`,
                color: 0x3b82f6,
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
        ([_, data]) => parseInt(data.rank, 10) === state.capitolRank,
      );
      const holderTag = holderEntry
        ? `[${holderEntry[0]}]`
        : `Rank #${state.capitolRank}`;

      const daysUntilNextWeek = 7 - state.dayOfWeekNumber + 1;
      const nextWeekResetTs =
        state.nextResetTimestamp + (daysUntilNextWeek - 1) * 86400;
      const nextWeekNum = (state.currentWeekNumber % 4) + 1;
      const nextWeekConfig = calConfig.capitol_rotation.find(
        (w) => w.week === nextWeekNum,
      );

      const nextHolderEntry = Object.entries(alliances).find(
        ([_, data]) => parseInt(data.rank, 10) === nextWeekConfig?.capitol_rank,
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

      // Tailor the button to their alliance if detected
      const viewQuery = detectedAllianceTag
        ? `?alliance=${detectedAllianceTag}`
        : "";
      const buttonLabel = detectedAllianceTag
        ? `Open Calendar ([${detectedAllianceTag}])`
        : "Open Full Calendar";

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: `📅 Kingdom War & Rotation Calendar — ${state.phaseName}`,
              color: state.isKW ? 0x8f0000 : 0xb8975a,
              description: state.isKW
                ? "⚔️ **Kingdom War Cycle is ACTIVE.** 2x Reward allocations apply this week."
                : "🛡️ **NAP Rest Week.** Standard kingdom operations and territory consolidation.",
              fields: fields,
              footer: { text: "Last Asylum Kingdom War Room" },
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

      // Next slot hour in Game Time
      const nextSlotHourGT = (slotHours[activeSlotIndex] + 4) % 24;

      // Convert GT hour to UTC hour: GT = UTC - 2 => UTC = GT + 2
      const nextSlotUtcHour = (nextSlotHourGT + 2) % 24;

      const nextSlotTime = new Date(now);
      nextSlotTime.setUTCHours(nextSlotUtcHour, 0, 0, 0);

      // If the next slot wraps past midnight GT into tomorrow
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
          },
        );
      }
      const scheduleTitleText = t.sb.schedule_title.replace(
        "{day}",
        selectedDay,
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
          process.env.GIST_TOKEN,
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
        (opt) => opt.name === "action",
      )?.value;

      // Enforce execution exclusively within the NAP server
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

      // SUB-ACTION: Broad-sync all registered alliance servers (Admin only)
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
            gistData.files["map-state.json"]?.content || "{}",
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
              },
            );

            results.push(
              `${syncRes.ok ? "✅" : "❌"} **[${tag}]** (\`${data.guild_id}\`)`,
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

      // DEFAULT ACTION: R5 Registration Portal Link
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
          (r) => r === "r5" || r === "@r5" || matchesRoleKeyword(r, "r5"),
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
          gistData.files["map-state.json"]?.content || "{}",
        );
        const knownAlliances = Object.keys(mapState.alliances || {});

        const matchedAllianceTag = knownAlliances.find((tag) => {
          const cleanTag = tag.toLowerCase();
          return memberRoleNames.some(
            (r) =>
              r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`,
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

        const tokenPayload = {
          alliance: matchedAllianceTag,
          action: "register",
          client_id: clientId,
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
                color: 0xb8975a,
                description: `Click below to authorize the bot and link your alliance's Discord server to the War Room.\n\n• Installs commands (\`/calendar\`, \`/nominate\`, \`/rewards\`, \`/map\`, \`/sb\`, \`/rules\`).\n• Allows configuring delegated roles (e.g. \`@HR\`).`,
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

      // 1. OWNER SERVER RESTRICTION: Non-admin users cannot submit nominations here
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
          gistData.files["map-state.json"]?.content || "{}",
        );
        const knownAlliances = Object.keys(mapState.alliances || {});

        let matchedAllianceTag = null;

        // Dynamic Alliance Server Resolution (Registered via Gist)
        let registeredAlliance = Object.entries(mapState.alliances || {}).find(
          ([_, data]) =>
            data?.guild_id && String(data.guild_id).trim() === guildId,
        );

        // Fallback compatibility for existing WLO environment variable
        if (!registeredAlliance && wloGuildId && guildId === wloGuildId) {
          registeredAlliance = [
            "WLO",
            { guild_id: wloGuildId, delegated_roles: ["hr", "officer"] },
          ];
        }

        // --- PATH A: Dedicated Alliance Server ---
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
              allowedRoles.some((kw) => matchesRoleKeyword(roleName, kw)),
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
        }
        // --- PATH B: Shared Server (NAP Server / Global) ---
        else {
          const isR5 = memberRoleNames.some(
            (r) => r === "r5" || r === "@r5" || matchesRoleKeyword(r, "r5"),
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
                r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`,
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
          gistData.files["rewards-data.json"]?.content || "{}",
        );
        const isKW = rewardsData.mode === "kw";

        const allianceInfo = mapState.alliances[matchedAllianceTag];
        const rank = parseInt(allianceInfo?.rank, 10);

        if (isNaN(rank)) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ **[${matchedAllianceTag}]** does not have an active rank assigned in the War Room.`,
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
                title: `🎁 Reward Nominations — [${matchedAllianceTag}]${isKW ? "⚔️ [KW 2x Active]" : ""}`,
                color: isKW ? 0x8f0000 : 0xb8975a,
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
        (opt) => opt.name === "action",
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
            gistData.files["rewards-data.json"]?.content || "{}",
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
            },
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
          gistData.files["map-state.json"]?.content || "{}",
        );
        const rewardsData = JSON.parse(
          gistData.files["rewards-data.json"]?.content || "{}",
        );
        const nominations = JSON.parse(
          gistData.files["rewards-nominations.json"]?.content || "{}",
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
              new Date(entry.submittedAt).getTime() / 1000,
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
                  footer: { text: "Last Asylum War Room" },
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

  // --- BUTTON INTERACTIONS (Map Switcher & Admin Proposals) ---
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const rawHost =
      req.headers["x-forwarded-host"] || req.headers.host || "la-s78.app";
    const resolvedHost = rawHost.split(",")[0].trim();
    const lang = resolveUserLocale(interaction, null);
    const t = getBotStrings(lang);

    // 1. PUBLIC MAP VIEW SWITCH BUTTONS
    if (custom_id && custom_id.startsWith("map_view:")) {
      const targetView = custom_id.replace("map_view:", "");
      const revision = await getLatestMapRevision(
        process.env.GIST_ID,
        process.env.GIST_TOKEN,
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

    // 2. ADMIN PROPOSALS & REVIEWS (Protected by AUTHORIZED_USER_ID)
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
          a.filename.startsWith(filePrefix),
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
          },
        );

        const acceptJson = await acceptRes.json().catch(() => ({}));
        if (!acceptRes.ok) {
          throw new Error(
            acceptJson.error || `Server responded with ${acceptRes.status}`,
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
      JSON.stringify(interaction.message.embeds[0]),
    );
    originalEmbed.color = isApproved ? 0x22c55e : 0xef4444;

    const statusIndex = originalEmbed.fields.findIndex((f) =>
      f.name.toLowerCase().includes("status"),
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
