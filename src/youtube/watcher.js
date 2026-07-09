const fs = require('fs');
const path = require('path');

const { client } = require('../client');
const { config } = require('../config');
const channels = require('./channels');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const STATE_PATH = path.join(process.cwd(), 'data', 'youtube-state.json');
const SHORTS_PAGE_TIMEOUT_MS = 8000;

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

function titleLooksLikeShorts(title) {
  return /(^|\s)#?(shorts?|ytshorts)(\s|$|[.!?,:;#])/i.test(title);
}

async function fetchTextWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 YouTube watcher',
      },
    });

    if (!response.ok) {
      return null;
    }

    return {
      text: await response.text(),
      url: response.url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getShortsCheck(video) {
  if (titleLooksLikeShorts(video.title)) {
    return { isShorts: true, reason: 'title' };
  }

  try {
    const page = await fetchTextWithTimeout(
      `https://www.youtube.com/watch?v=${video.videoId}`,
      SHORTS_PAGE_TIMEOUT_MS,
    );

    if (!page) {
      return { isShorts: false, reason: null };
    }

    const shortsUrl = `/shorts/${video.videoId}`;

    if (
      page.url.includes(shortsUrl) ||
      page.text.includes(`"webPageType":"WEB_PAGE_TYPE_SHORTS"`) ||
      page.text.includes(shortsUrl) ||
      page.text.includes(`https://www.youtube.com/shorts/${video.videoId}`)
    ) {
      return { isShorts: true, reason: 'youtube-page' };
    }
  } catch (error) {
    console.error(`YouTube shorts check failed for ${video.videoId}:`, error);
  }

  return { isShorts: false, reason: null };
}

function buildStateEntry(video, extra = {}) {
  return {
    lastVideoId: video.videoId,
    lastTitle: video.title,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

async function announceVideo(video) {
  const discordChannel = await client.channels
    .fetch(config.YOUTUBE_NEWS_CHANNEL_ID)
    .catch(() => null);

  if (!discordChannel?.isTextBased()) {
    console.error('YouTube news channel not found or not text-based.');
    return false;
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

  return true;
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

      if (currentState?.lastVideoId === latestVideo.videoId) {
        continue;
      }

      const shortsCheck = await getShortsCheck(latestVideo);

      if (shortsCheck.isShorts) {
        state[item.channelId] = buildStateEntry(latestVideo, {
          lastSkippedReason: `shorts:${shortsCheck.reason}`,
        });

        changed = true;
        continue;
      }

      if (!currentState?.lastVideoId) {
        state[item.channelId] = buildStateEntry(latestVideo);

        changed = true;

        if (announceOnFirstRun) {
          await announceVideo(latestVideo);
        }

        continue;
      }

      const announced = await announceVideo(latestVideo);

      if (!announced) {
        continue;
      }

      state[item.channelId] = buildStateEntry(latestVideo);

      changed = true;
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
