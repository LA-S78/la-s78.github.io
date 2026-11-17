// api/_bot_ascension.js
// The Top 4 race's results post in NAP leadership (api/_ascension.js) carries two buttons for
// Stewards (owner request, 2026-11-17): "Apply new ranks" and "Keep current order".
//
// Applying re-ranks the whole NAP list by the race (owner decision, 2026-11-17), academies
// included: alliances measured on all three days take ranks 1, 2, 3… by their total Might,
// the rest follow (planRanks). Ranks also set each alliance's reward chests (distribution
// tiers by rank), and a new Top 4 takes its Capitol seats at the next 4-week cycle (Option A).
// The post is shared, so it stays in English whoever clicks; private replies follow the
// Steward's Discord language.

import { InteractionResponseType } from 'discord-interactions';
import { gistJson, updateGist } from './_gist.js';
import { isSteward } from './_stewards.js';
import { say } from './_messages.js';
import { resolveActorName, resolveUserId, sendEphemeralMessage } from './_bot_common.js';
import { getWaitUntil } from './_after_response.js';
import { ASCENSION_FILE, napTags, standings } from './_ascension.js';

/** The results post's buttons; run id = the race week's Monday (GT). */
export function ascensionButtons(runId) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: 'Apply Top 4',
          custom_id: `ascension:apply:${runId}`,
          emoji: { name: '👑' },
        },
        { type: 2, style: 2, label: 'Keep current order', custom_id: `ascension:keep:${runId}` },
      ],
    },
  ];
}

/**
 * What applying would change (owner, 2026-11-17: the whole NAP list follows the race, academies
 * included): { order: [tags], changes: [{ tag, from, to }] } or { error }.
 * - NAP alliances measured on all three days take ranks 1, 2, 3… by their total;
 * - NAP alliances missing a day follow, in their current order (ranked first, then by tag);
 * - alliances outside the NAP that have a rank keep their order, after all of them.
 * `alliances` is map-state.json's list; `rows` the race's standings.
 */
export function planRanks(alliances = {}, rows = []) {
  const nap = napTags(alliances);
  const rankOf = (tag) => {
    const r = Number(alliances[tag]?.rank);
    return Number.isFinite(r) && r > 0 ? r : null;
  };
  const byOldRank = (a, b) => (rankOf(a) ?? 999) - (rankOf(b) ?? 999) || a.localeCompare(b);
  const measured = rows.filter((r) => r.complete && nap.includes(r.tag)).map((r) => r.tag);
  if (measured.length < 4) return { error: 'fewer than four alliances were measured on every day' };
  const unmeasured = nap.filter((t) => !measured.includes(t)).sort(byOldRank);
  const others = Object.keys(alliances)
    .filter((t) => !nap.includes(t) && rankOf(t) !== null)
    .sort(byOldRank);
  const order = [...measured, ...unmeasured, ...others];
  const changes = order
    .map((tag, i) => ({ tag, from: rankOf(tag), to: i + 1 }))
    .filter((c) => c.from !== c.to);
  return { order, changes };
}

/** "[PHNX] #5 → #4 · [MIA] #4 → #5" */
const changeLine = (changes) =>
  changes.map((c) => `[${c.tag}] ${c.from ? `#${c.from}` : 'unranked'} → #${c.to}`).join(' · ');

/** Saves the decision (and the new ranks when applying); { changes } or { error }. */
async function decide(runId, apply, by) {
  let outcome = null;
  await updateGist((gist) => {
    const data = gistJson(gist, ASCENSION_FILE, { runs: {} });
    const run = data.runs?.[runId];
    if (!run) {
      outcome = { error: say('bot_ascension.no_race') };
      return {};
    }
    if (run.decision) {
      outcome = { error: say('bot_ascension.already', { name: run.decision.by }) };
      return {};
    }
    const state = gistJson(gist, 'map-state.json', null);
    if (!state) {
      outcome = { error: 'map-state.json missing from the Gist' };
      return {};
    }
    const files = {};
    let changes = [];
    if (apply) {
      const plan = planRanks(state.alliances || {}, standings(run, napTags(state.alliances || {})));
      if (plan.error) {
        outcome = { error: say('bot_ascension.cannot_apply', { reason: plan.error }) };
        return {};
      }
      changes = plan.changes;
      for (const c of changes) state.alliances[c.tag].rank = c.to;
      if (changes.length) {
        state.lastUpdated = new Date().toISOString();
        state.updatedBy = by;
        files['map-state.json'] = state;
      }
    }
    run.decision = { applied: apply, by, at: new Date().toISOString(), changes };
    files[ASCENSION_FILE] = data;
    outcome = { changes };
    return {
      files,
      description: apply
        ? `Top 4 race applied by ${by}${changes.length ? `: ${changeLine(changes)}` : ' (no change)'}`
        : `Top 4 race: current order kept by ${by}`,
    };
  });
  return outcome || { error: 'not saved' };
}

/** The results post after a decision: the same embed with what was done, and no buttons. */
function decidedMessage(message, apply, by, changes) {
  const embed = { ...((message && message.embeds && message.embeds[0]) || {}) };
  const done = apply
    ? changes.length
      ? `✅ **Applied by ${by}:** ${changeLine(changes)}. New Top 4 seats start at the next cycle.`
      : `✅ **Applied by ${by}:** the NAP ranks already matched.`
    : `↩️ **Current order kept by ${by}.**`;
  embed.description = `${(embed.description || '').replace(/\n\n[^\n]*$/, '')}\n\n${done}`;
  return { embeds: [embed], components: [] };
}

/** ascension:<apply|keep>:<run id> */
export async function handleAscensionButton(ctx) {
  const { res, interaction, custom_id } = ctx;
  if (!isSteward(resolveUserId(interaction))) {
    return sendEphemeralMessage(res, say('bot_ascension.stewards_only'));
  }
  const [, action, runId] = custom_id.split(':');
  const apply = action === 'apply';
  const by = resolveActorName(interaction, 'Steward');

  // Answered at once; the save can take a few safe-save rounds (as the Kingdom War buttons)
  const waitUntil = interaction?.application_id && interaction?.token ? getWaitUntil() : null;
  if (!waitUntil) {
    const outcome = await decide(runId, apply, by);
    if (outcome.error) return sendEphemeralMessage(res, `⚠️ ${outcome.error}`);
    return res.status(200).json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: decidedMessage(interaction.message, apply, by, outcome.changes),
    });
  }
  const webhook = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  const send = (url, method, body) =>
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => {
      if (!r.ok) throw new Error(`Discord responded with ${r.status}`);
    });
  waitUntil(
    (async () => {
      const outcome = await decide(runId, apply, by).catch((err) => ({ error: err.message }));
      try {
        if (outcome.error)
          await send(webhook, 'POST', { content: `⚠️ ${outcome.error}`, flags: 64 });
        else
          await send(
            `${webhook}/messages/@original`,
            'PATCH',
            decidedMessage(interaction.message, apply, by, outcome.changes),
          );
      } catch (err) {
        console.error('Top 4 race: Discord could not be answered:', err.message);
      }
    })(),
  );
  return res.status(200).json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
}
