// api/register-alliance.js
import { isGistConfigured, readGist, gistJson, updateGist } from './_gist.js';
import { verifyToken } from './_tokens.js';
import { ALLIANCE_COMMANDS_SCHEMA } from './_bot_schema.js'; // one list, shared with the bot
import { checkTargetServer } from './_register_checks.js';
import { isSteward } from './_stewards.js';
import { inLanguage, say } from './_messages.js';

export default function handler(req, res) {
  return inLanguage(req, () => respond(req, res));
}

async function respond(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    token,
    guildId,
    delegatedRoles,
    alert_channel_id,
    alert_role_id,
    officer_channel_id,
    alliance_color,
  } = req.body || {};

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || !guildId || !botToken || !clientId || !isGistConfigured()) {
    return res.status(400).json({ error: 'Missing required configuration or parameters.' });
  }

  if (!/^\d{17,20}$/.test(String(guildId).trim())) {
    return res.status(400).json({ error: say('api_register.guild_id_format') });
  }

  const payload = verifyToken(token, botToken, { action: 'register' });
  if (!payload || payload.action !== 'register' || !payload.alliance) {
    return res.status(403).json({
      error: say('api_register.token_invalid'),
    });
  }

  const cleanGuildId = String(guildId).trim();
  const cleanRoles = Array.isArray(delegatedRoles)
    ? delegatedRoles
        .map((r) =>
          String(r)
            .replace(/[@\[\]]/g, '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];

  // Validate Operations Alert Channel ID
  const rawAlertChannel = String(alert_channel_id || '').trim();
  if (!rawAlertChannel || !/^\d{17,20}$/.test(rawAlertChannel)) {
    return res.status(400).json({
      error: say('api_register.alert_channel_needed'),
    });
  }
  const cleanChannelId = rawAlertChannel;

  // Validate Optional Default Alert Role ID
  let cleanRoleId = null;
  if (alert_role_id) {
    const rawRoleId = String(alert_role_id).trim();
    if (!/^\d{17,20}$/.test(rawRoleId)) {
      return res.status(400).json({
        error: say('api_register.alert_role_format'),
      });
    }
    cleanRoleId = rawRoleId;
  }

  // Validate Officer Ticket Intake Channel ID
  const rawOfficerChannel = String(officer_channel_id || '').trim();
  if (!rawOfficerChannel || !/^\d{17,20}$/.test(rawOfficerChannel)) {
    return res.status(400).json({
      error: say('api_register.officer_channel_needed'),
    });
  }
  const cleanOfficerChannelId = rawOfficerChannel;

  // Validate Alliance Identity Color (Hex)
  let cleanColor = '#B8975A';
  if (alliance_color) {
    const rawColor = String(alliance_color).trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(rawColor)) {
      return res.status(400).json({
        error: say('api_register.color_format'),
      });
    }
    cleanColor = rawColor;
  }

  // 1. The server: bot present, the person registering may manage it (Administrator or
  //    Manage Server; Stewards may register for an alliance), channels and role are in it.
  const check = await checkTargetServer({
    guildId: cleanGuildId,
    uid: payload.uid || null,
    steward: Boolean(payload.uid && isSteward(payload.uid)),
    alertChannelId: cleanChannelId,
    officerChannelId: cleanOfficerChannelId,
    alertRoleId: cleanRoleId,
    delegatedRoles: cleanRoles,
    botToken,
  }).catch((err) => ({
    ok: false,
    status: 502,
    error: say('api_register.discord_unreachable', { reason: err.message }),
  }));
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  // 2. Fetch Current Gist State & Check for Guild ID Collisions
  let currentState = {};
  try {
    currentState = gistJson(await readGist(), 'map-state.json');
  } catch (err) {
    console.error('Failed to retrieve Gist state:', err);
    return res.status(500).json({ error: `Failed to read kingdom state: ${err.message}` });
  }

  const alliances = currentState.alliances || {};

  // Conflict Guard: Ensure this Discord Server isn't already claimed by another alliance
  const existingClaim = Object.entries(alliances).find(
    ([tag, data]) =>
      data?.guild_id && String(data.guild_id).trim() === cleanGuildId && tag !== payload.alliance,
  );

  if (existingClaim) {
    return res.status(409).json({
      error: say('api_register.already_linked', { guild: cleanGuildId, tag: existingClaim[0] }),
    });
  }

  // 3. Deploy Guild Slash Commands Instantly
  const deployUrl = `https://discord.com/api/v10/applications/${clientId}/guilds/${cleanGuildId}/commands`;
  const deployRes = await fetch(deployUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ALLIANCE_COMMANDS_SCHEMA),
  });

  if (!deployRes.ok) {
    const errText = await deployRes.text();
    console.error('Failed to register guild commands:', errText);
    return res.status(500).json({ error: say('api_register.deploy_failed') });
  }

  // 4. Persist Guild Mapping, Alert Config, Ticket Channel & Color to GitHub Gist
  // Re-read and saved safely (updateGist): the slash-command step above can take a while,
  // and other saves may have landed meanwhile.
  try {
    await updateGist((gist) => {
      const state = gistJson(gist, 'map-state.json');
      if (!state.alliances) state.alliances = {};
      if (!state.alliances[payload.alliance]) state.alliances[payload.alliance] = {};

      const allianceRecord = state.alliances[payload.alliance];
      allianceRecord.guild_id = cleanGuildId;
      allianceRecord.delegated_roles = cleanRoles;
      allianceRecord.alert_channel_id = cleanChannelId;
      allianceRecord.alert_role_id = cleanRoleId;
      allianceRecord.officer_channel_id = cleanOfficerChannelId;
      allianceRecord.color = cleanColor;

      state.lastUpdated = new Date().toISOString();

      return {
        files: { 'map-state.json': state },
        description: `Server, alerts, and ticket routing registered for [${payload.alliance}] at ${new Date().toISOString()}`,
      };
    });

    return res.status(200).json({
      success: true,
      alliance: payload.alliance,
      guildId: cleanGuildId,
      delegatedRoles: cleanRoles,
      alertChannelId: cleanChannelId,
      alertRoleId: cleanRoleId,
      officerChannelId: cleanOfficerChannelId,
      allianceColor: cleanColor,
      serverName: check.serverName,
      warnings: check.warnings,
    });
  } catch (gistErr) {
    console.error('Failed to commit alliance registration:', gistErr);
    return res.status(500).json({
      error: say('api_register.save_failed', { reason: gistErr.message }),
    });
  }
}
