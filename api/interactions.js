import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';

// Disable default Vercel body parsing so we can read the raw binary body required for Ed25519 verification
export const config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).send('Missing signature headers');
  }

  const rawBody = await getRawBody(req);
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!publicKey) {
    console.error('DISCORD_PUBLIC_KEY is missing from Vercel environment variables!');
    return res.status(500).send('Server configuration error');
  }

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return res.status(401).send('Bad request signature');
  }

  const interaction = JSON.parse(rawBody.toString());

  // 1. Respond to Discord PING
  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({ type: InteractionResponseType.PONG });
  }

  // 2. Handle Button Interactions
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const username = interaction.member?.user?.username || interaction.user?.username || 'Discord Admin';

    if (userId !== process.env.AUTHORIZED_USER_ID) {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '⛔ **Access Denied:** Only Admin can approve or reject map proposals.',
          flags: 64
        }
      });
    }

    const isApproved = custom_id === 'approve_proposal';

    // --- NEW: Backend Bridge Logic ---
    if (isApproved) {
      try {
        // 1. Find the strategy-blueprint.json attachment
        const blueprintAttachment = interaction.message.attachments?.find(a => a.filename === 'strategy-blueprint.json');
        
        if (!blueprintAttachment) {
          throw new Error('Blueprint JSON missing from the original message.');
        }

        // 2. Download the JSON data from Discord
        const blueprintRes = await fetch(blueprintAttachment.url);
        if (!blueprintRes.ok) throw new Error('Failed to download blueprint file from Discord.');
        const changes = await blueprintRes.json();

        // 3. Send it to the accept-proposal endpoint
        const acceptRes = await fetch(`https://${req.headers.host}/api/accept-proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            changes: changes,
            submittedBy: username,
            secretKey: process.env.DISCORD_BOT_TOKEN 
          })
        });

        if (!acceptRes.ok) {
          const errorData = await acceptRes.json().catch(() => ({}));
          throw new Error(errorData.error || `Server responded with ${acceptRes.status}`);
        }
      } catch (error) {
        console.error('Interaction bridge failed:', error);
        // Abort the visual update and alert the Admin of the failure
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ **Failed to update map:** ${error.message}`,
            flags: 64 // Ephemeral
          }
        });
      }
    }
    // --- END NEW LOGIC ---

    // Deep clone the original embed so we don't accidentally send read-only properties
    const originalEmbed = JSON.parse(JSON.stringify(interaction.message.embeds[0]));

    // Clean out any lingering image references so Discord ignores them
    delete originalEmbed.image;
    delete originalEmbed.thumbnail;

    originalEmbed.color = isApproved ? 0x22c55e : 0xef4444;
    originalEmbed.fields[2] = {
      name: 'Status',
      value: isApproved 
        ? `✅ **Approved by <@${userId}>**` 
        : `❌ **Rejected by <@${userId}>**`,
      inline: false
    };

    return res.status(200).json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [originalEmbed],
        // Tell Discord to retain ALL existing files (the Map Image AND the JSON blueprint)
        attachments: interaction.message.attachments ? interaction.message.attachments.map(a => ({ id: a.id })) : [],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_proposal',
                label: isApproved ? 'Approved' : 'Approve Proposal',
                style: 3,
                disabled: true
              },
              {
                type: 2,
                custom_id: 'reject_proposal',
                label: !isApproved ? 'Rejected' : 'Reject Proposal',
                style: 4,
                disabled: true
              }
            ]
          }
        ]
      }
    });
  }

  return res.status(400).end();
}