// api/_bot_ascension.js
// The Top 4 race's results post in NAP leadership (api/_ascension.js) carries two buttons for
// Stewards (owner request, 2026-11-17): "Apply Top 4" and "Keep current order".
//
// Applying changes only who is in the Top 4, as the calendar's seat inheritance does (Option A,
// docs/DECISIONS.md): an alliance entering the Top 4 takes the rank of the one leaving it
// (best newcomer, best vacated rank), and the one leaving takes the newcomer's old rank (the
// end of the ranked list when the newcomer had none, e.g. an academy). Rank #1 and the order
// inside the Top 4 are left as they are. Seats move at the next 4-week cycle, as they always do.
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
 * What applying would change: { top4: [tags], changes: [{ tag, from, to }] } or { error }.
 * `alliances` is map-state.json's list; `rows` the race's standings.
 */
export function planTop4(alliances = {}, rows = []) {
  const nap = new Set(napTags(alliances));
  const rankOf = (tag) => {
    const r = Number(alliances[tag]?.rank);
    return Number.isFinite(r) && r > 0 ? r : null;
  };
  const top4 = rows
    .filter((r) => r.complete && nap.has(r.tag))
    .slice(0, 4)
    .map((r) => r.tag);
  if (top4.length < 4) return { error: 'fewer than four alliances were measured on every day' };
  const current = [...nap]
    .filter((t) => rankOf(t) !== null && rankOf(t) <= 4)
    .sort((a, b) => rankOf(a) - rankOf(b));
  const entering = top4.filter((t) => !current.includes(t));
  const leaving = current.filter((t) => !top4.includes(t));
  let end = Math.max(0, ...Object.keys(alliances).map((t) => rankOf(t) || 0));
  const changes = [];
  entering.forEach((tag, i) => {
    const out = leaving[i];
    if (!out) return; // fewer than four ranked today: the newcomer takes a free rank below
    const was = rankOf(tag);
    changes.push({ tag, from: was, to: rankOf(out) });
    changes.push({ tag: out, from: rankOf(out), to: was ?? ++end });
  });
  // Ranks 1–4 not held by anyone (a Top 4 of fewer than four): newcomers fill them in order
  const taken = new Set(current.filter((t) => top4.includes(t)).map(rankOf));
  for (const c of changes) if (c.to <= 4) taken.add(c.to);
  for (const tag of entering.slice(leaving.length)) {
    const free = [1, 2, 3, 4].find((r) => !taken.has(r));
    taken.add(free);
    changes.push({ tag, from: rankOf(tag), to: free });
  }
  return { top4, changes };
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
      const plan = planTop4(state.alliances || {}, standings(run, napTags(state.alliances || {})));
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
      ? `✅ **Applied by ${by}:** ${changeLine(changes)}. The new Top 4 take their seats at the next cycle.`
      : `✅ **Applied by ${by}:** the Top 4 is unchanged.`
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
