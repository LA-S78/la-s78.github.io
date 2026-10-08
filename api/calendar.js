// api/calendar.js
import { getCycleState, generateCycleEvents, DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gistId = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;

  let config = DEFAULT_CALENDAR_CONFIG;
  let customEvents = [];
  let alliances = {};

  try {
    if (gistId && gistToken) {
      const gistRes = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: { Authorization: `Bearer ${gistToken}`, 'User-Agent': 'WarRoom-App' },
        signal: AbortSignal.timeout(2500)
      });

      if (gistRes.ok) {
        const gistData = await gistRes.json();
        const calFile = gistData.files?.['calendar-state.json']?.content;
        const mapFile = gistData.files?.['map-state.json']?.content;

        if (calFile) {
          const parsedCal = JSON.parse(calFile);
          config = { ...config, ...parsedCal };
          customEvents = parsedCal.custom_events || [];
        }
        if (mapFile) {
          alliances = JSON.parse(mapFile).alliances || {};
        }
      }
    }
  } catch (err) {
    console.warn('Calendar state fetch failed, using defaults:', err.message);
  }

  const now = new Date();
  const currentStatus = getCycleState(now, config);

  // Identify which alliance currently holds the capitol
  const holderAlliance = Object.entries(alliances).find(
    ([_, data]) => parseInt(data.rank, 10) === currentStatus.capitolRank
  );
  const capitolHolderTag = holderAlliance ? holderAlliance[0] : `Rank #${currentStatus.capitolRank}`;

  // Time window: 14 days in the past, 28 days into the future
  const rangeStart = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
  const rangeEnd = new Date(now.getTime() + (28 * 24 * 60 * 60 * 1000));

  const generatedEvents = generateCycleEvents(rangeStart, rangeEnd, config);
  const allEvents = [...generatedEvents, ...customEvents].sort(
    (a, b) => new Date(a.start) - new Date(b.start)
  );

  return res.status(200).json({
    status: currentStatus,
    capitolHolder: capitolHolderTag,
    events: allEvents,
    alliances: Object.entries(alliances || {}).map(([tag, d]) => ({
      tag,
      rank: parseInt(d?.rank, 10) || null
    }))
  });
}