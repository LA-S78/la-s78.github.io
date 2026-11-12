// api/_bot_map.js
// /map and its view buttons: the territory map image.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED, getGistData, sendEphemeralMessage } from './_bot_common.js';
import { say } from './_messages.js';

/** --- /map COMMAND --- */
export async function handleMapCommand(ctx) {
  const { res, name, options, resolvedHost, lang, t } = ctx;
  try {
    let selectedView = 'level';
    const viewOpt = options?.find((opt) => opt.name === 'view');
    if (viewOpt?.value) {
      selectedView = String(viewOpt.value).toLowerCase();
    } else if (viewOpt?.options?.[0]?.value) {
      selectedView = String(viewOpt.options[0].value).toLowerCase();
    }

    const revision = await getLatestMapRevision();
    const payload = buildMapMessagePayload({
      view: selectedView,
      revision,
      resolvedHost,
      lang,
      t,
    });

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: payload,
    });
  } catch (err) {
    console.error('Error handling /map command:', err);
    return sendEphemeralMessage(res, say('bot_map.failed'));
  }
  return NOT_HANDLED;
}

/** 1A. PUBLIC MAP VIEW SWITCH BUTTONS */
export async function handleMapViewButton(ctx) {
  const { res, custom_id, resolvedHost, lang, t } = ctx;
  const targetView = custom_id.replace('map_view:', '');
  const revision = await getLatestMapRevision();
  const payload = buildMapMessagePayload({
    view: targetView,
    revision,
    resolvedHost,
    lang,
    t,
  });

  return res.status(200).json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: payload,
  });
  return NOT_HANDLED;
}

export const mapRevisionCache = {
  revision: 'initial',
  timestamp: 0,
};

export async function getLatestMapRevision() {
  const now = Date.now();
  if (mapRevisionCache.revision && now - mapRevisionCache.timestamp < 45 * 1000) {
    return mapRevisionCache.revision;
  }
  try {
    const gistData = await getGistData();
    const content = gistData.files?.['map-state.json']?.content;
    if (content) {
      const state = JSON.parse(content);
      mapRevisionCache.revision = state.revision || state.lastUpdated || 'initial';
      mapRevisionCache.timestamp = now;
    }
  } catch (e) {
    if (!mapRevisionCache.revision || mapRevisionCache.revision === 'initial') {
      mapRevisionCache.revision = Math.floor(now / (5 * 60 * 1000)).toString();
    }
  }
  return mapRevisionCache.revision;
}

export function buildMapMessagePayload({
  view = 'level',
  revision = 'initial',
  resolvedHost,
  lang,
  t,
}) {
  const selectedView = ['level', 'alliance', 'resource'].includes(view) ? view : 'level';

  // The view's title and text (_data/en/server.yml bot_map; the old map.views strings in
  // _source/bot.md were never filled in, so these replace them).
  const titles = {
    level: say('bot_map.level_title'),
    alliance: say('bot_map.alliance_title'),
    resource: say('bot_map.resource_title'),
  };
  const descriptions = {
    level: say('bot_map.level_text'),
    alliance: say('bot_map.alliance_text'),
    resource: say('bot_map.resource_text'),
  };

  const embedColors = {
    level: 0xca8a04,
    alliance: 0x0070f3,
    resource: 0x059669,
  };

  const mapImageUrl = `https://${resolvedHost}/api/map-image?view=${selectedView}&v=${revision}&ext=.png`;

  return {
    embeds: [
      {
        title: titles[selectedView],
        description: descriptions[selectedView],
        color: embedColors[selectedView],
        image: { url: mapImageUrl },
        footer: {
          text: say('bot_map.footer'),
        },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: selectedView === 'level' ? 1 : 2,
            label: say('bot_map.levels'),
            custom_id: 'map_view:level',
            disabled: selectedView === 'level',
            emoji: { name: '🏰' },
          },
          {
            type: 2,
            style: selectedView === 'alliance' ? 1 : 2,
            label: say('bot_map.alliances'),
            custom_id: 'map_view:alliance',
            disabled: selectedView === 'alliance',
            emoji: { name: '🗺️' },
          },
          {
            type: 2,
            style: selectedView === 'resource' ? 1 : 2,
            label: say('bot_map.resources'),
            custom_id: 'map_view:resource',
            disabled: selectedView === 'resource',
            emoji: { name: '🌾' },
          },
          {
            type: 2,
            style: 5,
            label: t?.map?.button || 'Web Map',
            url: `https://${resolvedHost}/${lang}/map.html`,
          },
        ],
      },
    ],
  };
}
