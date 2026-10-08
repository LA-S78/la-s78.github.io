// api/register-alliance.js
import crypto from "crypto";

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
    description: "Request a portal link to submit weekly chest nominations",
    type: 1,
  },
  {
    name: "rewards",
    description: "Display reward allocations and nomination status",
    type: 1,
  },
  {
    name: "sb",
    description: "Display the Survival Battle schedule",
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
    description: "View the live territory map",
    type: 1,
  },
];

function verifyRegistrationToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [dataString, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(dataString)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(dataString, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, guildId, delegatedRoles } = req.body;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const gistId = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;

  if (!token || !guildId || !botToken || !clientId || !gistId || !gistToken) {
    return res
      .status(400)
      .json({ error: "Missing required configuration or parameters." });
  }

  if (!/^\d{17,20}$/.test(String(guildId).trim())) {
    return res.status(400).json({ error: "Invalid Discord Guild ID format." });
  }

  const payload = verifyRegistrationToken(token, botToken);
  if (!payload || payload.action !== "register" || !payload.alliance) {
    return res
      .status(403)
      .json({
        error:
          "Token is invalid or expired. Run /registerbot again in Discord.",
      });
  }

  const cleanGuildId = String(guildId).trim();
  const cleanRoles = Array.isArray(delegatedRoles)
    ? delegatedRoles
        .map((r) =>
          String(r)
            .replace(/[@\[\]]/g, "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];

  // 1. Verify Bot Membership via Discord REST API
  const rolesCheckRes = await fetch(
    `https://discord.com/api/v10/guilds/${cleanGuildId}/roles`,
    {
      headers: { Authorization: `Bot ${botToken}` },
    },
  );

  if (rolesCheckRes.status === 403 || rolesCheckRes.status === 404) {
    return res.status(400).json({
      error:
        'The bot is not in this server. Please click "Authorize Bot" (Step 1) and invite it before registering.',
    });
  }

  if (!rolesCheckRes.ok) {
    return res
      .status(500)
      .json({
        error: `Discord verification failed (${rolesCheckRes.status}).`,
      });
  }

  // 2. Fetch Current Gist State & Check for Guild ID Collisions
  const gistHeaders = {
    Authorization: `Bearer ${gistToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "WarRoom-App",
  };

  let currentState = {};
  try {
    const gistGetRes = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: gistHeaders,
      cache: "no-store",
    });
    if (!gistGetRes.ok)
      throw new Error(`GitHub Gist get error (${gistGetRes.status})`);

    const gistData = await gistGetRes.json();
    currentState = JSON.parse(
      gistData.files["map-state.json"]?.content || "{}",
    );
  } catch (err) {
    console.error("Failed to retrieve Gist state:", err);
    return res
      .status(500)
      .json({ error: `Failed to read War Room state: ${err.message}` });
  }

  const alliances = currentState.alliances || {};

  // Conflict Guard: Ensure this Discord Server isn't already claimed by another alliance
  const existingClaim = Object.entries(alliances).find(
    ([tag, data]) =>
      data?.guild_id &&
      String(data.guild_id).trim() === cleanGuildId &&
      tag !== payload.alliance,
  );

  if (existingClaim) {
    return res.status(409).json({
      error: `Server ID ${cleanGuildId} is already linked to alliance [${existingClaim[0]}]. A Discord server cannot be registered to multiple alliances.`,
    });
  }

  // 3. Deploy Guild Slash Commands Instantly
  const deployUrl = `https://discord.com/api/v10/applications/${clientId}/guilds/${cleanGuildId}/commands`;
  const deployRes = await fetch(deployUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(ALLIANCE_COMMANDS_SCHEMA),
  });

  if (!deployRes.ok) {
    const errText = await deployRes.text();
    console.error("Failed to register guild commands:", errText);
    return res
      .status(500)
      .json({ error: "Failed to deploy slash commands to your server." });
  }

  // 4. Persist Guild Mapping to GitHub Gist
  try {
    if (!currentState.alliances) currentState.alliances = {};
    if (!currentState.alliances[payload.alliance]) {
      currentState.alliances[payload.alliance] = {};
    }

    currentState.alliances[payload.alliance].guild_id = cleanGuildId;
    currentState.alliances[payload.alliance].delegated_roles = cleanRoles;
    currentState.lastUpdated = new Date().toISOString();

    const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: { ...gistHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: `Server registered for [${payload.alliance}] at ${new Date().toISOString()}`,
        files: {
          "map-state.json": {
            content: JSON.stringify(currentState, null, 2),
          },
        },
      }),
    });

    if (!patchRes.ok)
      throw new Error(`GitHub Gist patch error (${patchRes.status})`);

    return res.status(200).json({
      success: true,
      alliance: payload.alliance,
      guildId: cleanGuildId,
      delegatedRoles: cleanRoles,
    });
  } catch (gistErr) {
    console.error("Failed to commit alliance registration:", gistErr);
    return res
      .status(500)
      .json({
        error: `Commands deployed, but failed to save configuration: ${gistErr.message}`,
      });
  }
}
