// api/_bot_devupdate.js
// /devupdate (owner server, Stewards only): copies the live data into the test Gist that the
// test site (dev.la-s78.app) uses, and the Stats files and alliance pictures into the test
// site's own Blob folders (api/_test_copy.js). Every reply is private to the person running it.

import { InteractionResponseType } from 'discord-interactions';
import { getWaitUntil } from './_after_response.js';
import { sendEphemeralMessage } from './_bot_common.js';
import { copyLiveGistToTest } from './_gist.js';
import { copyLiveBlobsToTest } from './_test_copy.js';
import { say } from './_messages.js';
import { isSteward } from './_stewards.js';

const PRIVATE = 64; // Discord's "only you can see this" flag

/** The result message (private): the Gist copy, then the Blob files (Stats, pictures). */
async function copyAndDescribe() {
  let gist;
  try {
    gist = await copyLiveGistToTest({ timeoutMs: 20000 });
  } catch (err) {
    return say('bot_admin.dev_failed', { reason: err.message });
  }
  let message = say('bot_admin.dev_done', {
    count: gist.copied.length,
    files: gist.copied.map((f) => `\`${f}\``).join(', '),
  });
  if (gist.removed.length) {
    message += `\n${say('bot_admin.dev_removed', { files: gist.removed.map((f) => `\`${f}\``).join(', ') })}`;
  }
  message += `\n${say('bot_admin.dev_scrubbed')}`;
  try {
    const blobs = await copyLiveBlobsToTest();
    message += `\n${say('bot_admin.dev_blobs', blobs)}`;
    if (blobs.failed.length) {
      message += `\n${say('bot_admin.dev_blobs_failed', { count: blobs.failed.length })}`;
    }
  } catch (err) {
    message += `\n${say('bot_admin.dev_blobs_skipped', { reason: err.message })}`;
  }
  return message;
}

/** /devupdate */
export async function handleDevUpdateCommand(ctx) {
  const { res, interaction, userId } = ctx;
  if (!isSteward(userId)) {
    return sendEphemeralMessage(res, say('bot_admin.dev_denied'));
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
