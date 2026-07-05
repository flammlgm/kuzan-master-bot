const fs = require('fs');
const path = require('path');

const { client } = require('../client');
const { config } = require('../config');
const channels = require('./channels');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const STATE_PATH = path.join(process.cwd(), 'data', 'youtube-state.json');

function ensureDataDir() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
}

function loadState() {
  ensureDataDir();

  if (!fs.existsSync(STATE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function getTagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1].trim()) : null;
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseLatestVideo(xml) {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);

  if (!entryMatch) return null;

  const entry = entryMatch[1];

  const videoId = getTagValue(entry, 'yt:videoId');
  const title = getTagValue(entry, 'title');
  const author = getTagValue(entry, 'name');
  const published = getTagValue(entry, 'published');

  if (!videoId || !title) return null;

  return {
    videoId,
    title,
    author: author || 'YouTube',
    published,
    url: `https://youtu.be/${videoId}`,
  };
}

async function fetchLatestVideo(channelId) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`YouTube RSS error ${response.status} for ${channelId}`);
  }

  const xml = await response.text();
  return parseLatestVideo(xml);
}

async function announceVideo(video) {
  const discordChannel = await client.channels
    .fetch(config.YOUTUBE_NEWS_CHANNEL_ID)
    .catch(() => null);

  if (!discordChannel?.isTextBased()) {
    console.error('YouTube news channel not found or not text-based.');
    return;
  }

  await discordChannel.send({
    content: [
      '📺 **Новое видео**',
      '',
      `👤 **${video.author}**`,
      `📝 ${video.title}`,
      '',
      video.url,
    ].join('\n'),
  });
}

async function checkYoutubeChannels({ announceOnFirstRun = false } = {}) {
  if (!config.YOUTUBE_NEWS_CHANNEL_ID) return;

  const state = loadState();
  let changed = false;

  for (const item of channels) {
    try {
      const latestVideo = await fetchLatestVideo(item.channelId);

      if (!latestVideo) continue;

      const currentState = state[item.channelId];

      if (!currentState?.lastVideoId) {
        state[item.channelId] = {
          lastVideoId: latestVideo.videoId,
          lastTitle: latestVideo.title,
          updatedAt: new Date().toISOString(),
        };

        changed = true;

        if (announceOnFirstRun) {
          await announceVideo(latestVideo);
        }

        continue;
      }

      if (currentState.lastVideoId !== latestVideo.videoId) {
        await announceVideo(latestVideo);

        state[item.channelId] = {
          lastVideoId: latestVideo.videoId,
          lastTitle: latestVideo.title,
          updatedAt: new Date().toISOString(),
        };

        changed = true;
      }
    } catch (error) {
      console.error(`YouTube watcher error for ${item.channelId}:`, error);
    }
  }

  if (changed) {
    saveState(state);
  }
}

function startYoutubeWatcher() {
  checkYoutubeChannels({ announceOnFirstRun: false }).catch((error) => {
    console.error('YouTube watcher initial check error:', error);
  });

  setInterval(() => {
    checkYoutubeChannels().catch((error) => {
      console.error('YouTube watcher interval error:', error);
    });
  }, CHECK_INTERVAL_MS);

  console.log('YouTube watcher started.');
}

module.exports = {
  startYoutubeWatcher,
  checkYoutubeChannels,
};