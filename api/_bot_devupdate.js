// api/_bot_devupdate.js
// /devupdate (owner server, Stewards only): copies the live data into the test Gist that the
// test site (dev.la-s78.app) uses. Every reply is private to the person running it.

import { InteractionResponseType } from 'discord-interactions';
import { getWaitUntil } from './_after_response.js';
import { sendEphemeralMessage } from './_bot_common.js';
import { copyLiveGistToTest } from './_gist.js';
import { isSteward } from './_stewards.js';

const PRIVATE = 64; // Discord's "only you can see this" flag

/** The result message (private). */
async function copyAndDescribe() {
  try {
    const files = await copyLiveGistToTest({ timeoutMs: 20000 });
    return `✅ **Test data updated.** Copied ${files.length} file(s) from the live data into the test Gist used by dev.la-s78.app: ${files.map((f) => `\`${f}\``).join(', ')}.\nThe live data was only read, not changed.`;
  } catch (err) {
    return `⚠️ **Test data not updated:** ${err.message}`;
  }
}

/** /devupdate */
export async function handleDevUpdateCommand(ctx) {
  const { res, interaction, userId } = ctx;
  if (!isSteward(userId)) {
    return sendEphemeralMessage(
      res,
      '⛔ **Access Denied:** Only Stewards can update the test data.',
    );
  }

  // Answer at once (privately), then copy and edit that answer: reading and writing the two
  // Gists can take longer than Discord's 3 seconds. Without Vercel's waitUntil (e.g. in
  // tests), copy first and answer with the result.
  const waitUntil = interaction.application_id && interaction.token ? getWaitUntil() : null;
  if (!waitUntil) return sendEphemeralMessage(res, await copyAndDescribe());

  const webhook = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  waitUntil(
    (async () => {
      const content = await copyAndDescribe();
      const r = await fetch(`${webhook}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).catch((e) => ({ ok: false, status: e.message }));
      if (!r.ok) console.error('/devupdate: could not post the result:', r.status);
    })(),
  );
  return res.status(200).json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: PRIVATE },
  });
}
