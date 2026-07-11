const { config } = require('./config');

const sharp = require('sharp');

async function prepareReference(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function generateImage(prompt, references = []) {
  if (!config.CLOUDFLARE_ACCOUNT_ID || !config.CLOUDFLARE_API_TOKEN) {
    throw new Error('Не заданы CLOUDFLARE_ACCOUNT_ID или CLOUDFLARE_API_TOKEN');
  }

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('steps', '20');
  form.append('width', '1024');
  form.append('height', '1024');

  for (const [index, reference] of references.slice(0, 4).entries()) {
    const prepared = await prepareReference(reference);
    form.append(`input_image_${index}`, new Blob([prepared], { type: 'image/jpeg' }), `reference-${index}.jpg`);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-dev`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
    },
    body: form,
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Cloudflare AI ${response.status}: ${details.slice(0, 500)}`);
  }

  const data = await response.json();
  if (!data.success || !data.result?.image) {
    throw new Error('Сервис не вернул изображение');
  }

  return Buffer.from(data.result.image, 'base64');
}

module.exports = { generateImage };
