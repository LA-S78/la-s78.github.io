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

  // FIX: verifyKey is async! MUST await it so invalid signatures correctly return 401.
  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return res.status(401).send('Bad request signature');
  }

  const interaction = JSON.parse(rawBody.toString());

  // 1. Respond to Discord PING (Required for Dev Portal verification)
  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({ type: InteractionResponseType.PONG });
  }

  // 2. Handle Button Interactions
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;

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
    const originalEmbed = interaction.message.embeds[0];

    // --- CRITICAL FIX: Repoint the embed to the permanent Discord CDN image ---
    if (interaction.message.attachments && interaction.message.attachments.length > 0) {
      // Find the image attachment (Discord sets content_type to 'image/jpeg' or similar)
      const imgAttachment = interaction.message.attachments.find(a => a.content_type?.startsWith('image/'));
      if (imgAttachment) {
        if (!originalEmbed.image) originalEmbed.image = {};
        originalEmbed.image.url = imgAttachment.url;
      }
    }

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
        // CRITICAL FIX: Pass the original attachments back so Discord doesn't un-link them and push them above the embed
        attachments: interaction.message.attachments ? interaction.message.attachments.map(a => ({ id: a.id })) : [],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_proposal',
                label: isApproved ? 'Approved' : 'Approve Map',
                style: 3,
                disabled: true
              },
              {
                type: 2,
                custom_id: 'reject_proposal',
                label: !isApproved ? 'Rejected' : 'Reject Map',
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