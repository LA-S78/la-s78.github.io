// api/_bot_caravan.js
// /caravan (owner request, 2026-11-27): the alliance's Caravan Rotor from Discord. Leaders
// (R4, R5, HR and the alliance's officer roles) see who's available and picked this week,
// and pick or undo a pick by name, the same change the dashboard makes (applyCaravanEdit),
// so the pick log and the alliance sheet's sync follow it too. A name not in the rotor yet is
// added and picked. Stewards may name another alliance (alliance:).

import { InteractionResponseType } from 'discord-interactions';
import { getGistData, sendEphemeralMessage } from './_bot_common.js';
import { gistJson, updateGist } from './_gist.js';
import { say } from './_messages.js';
import { resolveMemberAllianceContext } from './_bot_roles.js';
import { isSteward } from './_stewards.js';
import { matchesRoleKeyword } from './_officer_roles.js';
import { applyCaravanEdit, dashboardFile, findAllianceKey, readDashboard } from './_dashboard.js';

export async function handleCaravanCommand(ctx) {
  const { res, guildId, member, userId, botToken, options } = ctx;
  if (!guildId || !member) return sendEphemeralMessage(res, say('bot_caravan.server_only'));
  const option = (n) => options?.find((o) => o.name === n)?.value;
  const action = ['pick', 'unpick'].includes(option('action')) ? option('action') : 'show';
  const player = String(option('player') || '').trim();
  const askedAlliance = String(option('alliance') || '').trim();
  const steward = isSteward(userId);
  if (askedAlliance && !steward)
    return sendEphemeralMessage(res, say('bot_caravan.alliance_stewards_only'));
  if (action !== 'show' && !player)
    return sendEphemeralMessage(res, say('bot_caravan.player_needed'));

  try {
    const gist = await getGistData();
    const alliances = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
    let tag;
    if (askedAlliance) {
      tag = findAllianceKey(alliances, askedAlliance);
      if (!tag)
        return sendEphemeralMessage(
          res,
          say('bot_caravan.unknown_alliance', { tag: askedAlliance }),
        );
    } else {
      const c = await resolveMemberAllianceContext({ guildId, member, alliances, botToken });
      if (!c.detectedTag) return sendEphemeralMessage(res, say('bot_caravan.no_alliance'));
      // R4s too: they run the rotor (the dashboard's "leaders"), unlike nominations (R5)
      const isR4 = (c.memberRoleNames || []).some((r) => matchesRoleKeyword(r, 'r4'));
      if (!c.isR5 && !isR4 && !c.hasDelegatedLeadership && !steward) {
        return sendEphemeralMessage(res, say('bot_caravan.leaders_only'));
      }
      tag = findAllianceKey(alliances, c.detectedTag) || c.detectedTag;
    }
    const file = dashboardFile(tag, alliances, gist);
    const actor = String(
      member.nick || member.user?.global_name || member.user?.username || 'Discord',
    ).slice(0, 60);

    if (action === 'show') {
      return reply(res, tag, readDashboard(gistJson(gist, file, {}), tag).caravan);
    }

    // pick / unpick: saved like a dashboard change (a quick second try fits in Discord's time)
    let note = '';
    const saved = await updateGist(
      (fresh) => {
        const raw = gistJson(fresh, file, {});
        let c = readDashboard(raw, tag).caravan;
        let p = c.roster.find((x) => x.name.toLowerCase() === player.toLowerCase());
        const now = new Date().toISOString();
        if (!p && action === 'unpick')
          return { refused: say('bot_caravan.not_in_rotor', { name: player }) };
        if (!p) {
          const added = applyCaravanEdit(
            c,
            { action: 'caravan-add', name: player, from: '', to: '' },
            { actor, now },
          );
          if (added.error) return { refused: added.error };
          c = added.caravan;
          p = c.roster.find((x) => x.name.toLowerCase() === player.toLowerCase());
          note = say('bot_caravan.added', { name: p.name });
        }
        if (action === 'pick' && p.picked)
          return { refused: say('bot_caravan.already_picked', { name: p.name }) };
        if (action === 'unpick' && !p.picked)
          return { refused: say('bot_caravan.not_picked', { name: p.name }) };
        const out = applyCaravanEdit(c, { action: `caravan-${action}`, id: p.id }, { actor, now });
        if (out.error) return { refused: out.error };
        return {
          caravan: out.caravan,
          name: p.name,
          files: { [file]: { ...raw, caravan: out.caravan, updatedAt: now, updatedBy: actor } },
          description: `Caravan ${action} ${p.name} for [${tag}] by ${actor} (Discord)`,
        };
      },
      { gist, deadline: Date.now() + 1500 },
    );
    if (saved.refused) return sendEphemeralMessage(res, saved.refused);
    const done = say(action === 'pick' ? 'bot_caravan.picked_done' : 'bot_caravan.unpicked_done', {
      name: saved.name,
    });
    return reply(res, tag, saved.caravan, [note, done].filter(Boolean).join('\n'));
  } catch (err) {
    console.error('/caravan failed:', err);
    return sendEphemeralMessage(res, say('bot_caravan.failed'));
  }
}

/** The rotor as a private message: picked this week, and who's still available. */
function reply(res, tag, c, headline = '') {
  const picked = c.roster.filter((p) => p.picked);
  const left = c.roster.filter((p) => !p.picked);
  const when = (p) => (p.from ? ` (${p.to ? `${p.from}–${p.to}` : p.from} GT)` : '');
  const list = (arr, f) => (arr.length ? arr.map(f).join(', ') : '—');
  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: say('bot_caravan.title', { tag, picked: picked.length, total: c.roster.length }),
          color: 0xb8975a,
          description: [
            headline,
            `**${say('bot_caravan.picked')}** ${list(picked, (p) => p.name)}`,
            `**${say('bot_caravan.available')}** ${list(left, (p) => p.name + when(p))}`,
          ]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 4000),
          footer: { text: say('bot_caravan.footer') },
        },
      ],
      flags: 64,
    },
  });
}
