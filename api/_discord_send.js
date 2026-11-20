// api/_discord_send.js
// Every message the site itself posts or edits on Discord goes through here (the bot's own
// replies to commands don't: Discord sends commands only to the live site). On the test site
// (dev.la-s78.app, `isTestDeployment()`), whatever the feature asked for (owner and maintainer,
// 2026-11-20, before rehearsing the alliance ID move on a copy of the live data):
//   - the message goes to TEST_CHANNEL_ID, never to a live channel;
//   - it pings nobody (`allowed_mentions: { parse: [] }`), even if it names a role or member;
//   - anything else that changes Discord (installing commands in a server) isn't done.

import { isTestDeployment } from './_gist.js';

const API = 'https://discord.com/api/v10';

/** The channel a message really goes to: the test channel on the test site. */
export function outgoingChannel(channelId) {
  if (!isTestDeployment()) return channelId;
  const test = process.env.TEST_CHANNEL_ID;
  if (!test) throw new Error('The test site posts only to TEST_CHANNEL_ID, which is not set.');
  return test;
}

/** A message body as it may be sent: pinging nobody on the test site. */
export function outgoingBody(body = {}) {
  if (!isTestDeployment()) return body;
  return { ...body, allowed_mentions: { parse: [] } };
}

/**
 * Posts a message (`messageId` absent) or edits one (`messageId` given, PATCH). Returns the
 * fetch Response; `channelId` is the live channel the feature means.
 */
export function sendMessage(
  channelId,
  body,
  { messageId = null, timeoutMs = 4000, token = process.env.DISCORD_BOT_TOKEN } = {},
) {
  const channel = outgoingChannel(channelId);
  const path = messageId
    ? `/channels/${channel}/messages/${messageId}`
    : `/channels/${channel}/messages`;
  return fetch(`${API}${path}`, {
    method: messageId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(outgoingBody(body)),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Posts a message with attachments (a FormData with `payload_json` and files), as proposals do.
 * On the test site its `payload_json` gets `allowed_mentions: { parse: [] }` too.
 */
export function sendForm(channelId, form, { token = process.env.DISCORD_BOT_TOKEN } = {}) {
  const channel = outgoingChannel(channelId);
  if (isTestDeployment() && form.has('payload_json')) {
    const payload = JSON.parse(String(form.get('payload_json')));
    form.set('payload_json', JSON.stringify(outgoingBody(payload)));
  }
  return fetch(`${API}/channels/${channel}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}` },
    body: form,
  });
}

/** Whether this deployment may change Discord beyond posting messages (never the test site). */
export const mayChangeDiscord = () => !isTestDeployment();
