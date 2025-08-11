// Importações
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import express from 'express'; // Precisamos do Express para o proxy
import { URL } from 'url';

const { addonBuilder } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.proxy',
  version: '28.0.0', // A versão com proxy reverso
  name: 'Fortal Play (Superflix)',
  description: 'Addon com proxy reverso para garantir a compatibilidade do player.',
  logo: 'https://files.catbox.moe/jwtaje.jpg',
  resources: ['catalog', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'fortal-search-movies', name: 'Busca Fortal Filmes', extra: [{ name: 'search', isRequired: true }] },
    { type: 'series', id: 'fortal-search-series', name: 'Busca Fortal Séries', extra: [{ name: 'search', isRequired: true }] }
  ],
  idPrefixes: ['tt', 'tmdb:']
};

// --- LÓGICA DO ADDON ---
const builder = new addonBuilder(manifest);

// 1. HANDLER DE CATÁLOGO (BUSCA)
builder.defineCatalogHandler(async ({ type, extra }) => {
  // ... (código da busca, sem alterações)
  const query = extra?.search;
  if (!query) return Promise.resolve({ metas: [] });
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const metas = data.results.filter(i => i.poster_path).map(i => ({ id: `tmdb:${i.id}`, type, name: i.title || i.name, poster: `https://image.tmdb.org/t/p/w500${i.poster_path}` }));
    return Promise.resolve({ metas });
  } catch (e) { return Promise.resolve({ metas: [] }); }
});

// 2. HANDLER DE STREAMS (AGORA ELE CRIA O LINK DO NOSSO PROXY)
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[HANDLER] Iniciando busca de streams para ${id}`);
  let imdbId = id.includes(':') ? id.split(':')[0] : id;

  if (imdbId.startsWith('tmdb:')) {
    const tmdbId = imdbId.split(':')[1];
    const findUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${API_KEY}`;
    try {
      const res = await fetch(findUrl);
      const externalIds = await res.json();
      imdbId = externalIds.imdb_id;
    } catch(e) { return Promise.resolve({ streams: [] }); }
  }

  if (!imdbId || !imdbId.startsWith('tt')) return Promise.resolve({ streams: [] });

  try {
    const superflixType = type === 'movie' ? 'filme' : 'serie';
    const pageUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
    const pageResponse = await fetch(pageUrl);
    const html = await pageResponse.text();
    const cookies = pageResponse.headers.get('set-cookie');

    if (!cookies) return Promise.resolve({ streams: [] });

    const $ = cheerio.load(html);
    const serverElements = $('.player_select_item');
    if (serverElements.length === 0) return Promise.resolve({ streams: [] });

    const streamPromises = serverElements.toArray().map(element => {
      const serverId = $(element).data('id');
      const serverName = $(element).find('.player_select_name').text().trim();
      
      if (!serverId || serverId === 'fake-legendado') return null;

      return fetch('https://superflixapi.digital/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies, 'Referer': pageUrl },
        body: `action=getPlayer&video_id=${serverId}`
      })
      .then(res => res.json())
      .then(data => {
        if (data.message === 'success' && data.data?.video_url) {
          const finalVideoUrl = data.data.video_url;
          // CRIA O LINK PARA O NOSSO PROXY
          const proxyUrl = `/stream/${encodeURIComponent(Buffer.from(finalVideoUrl).toString('base64'))}.mp4`;
          console.log(`[HANDLER] Link da Superflix obtido. Criando link de proxy: ${proxyUrl}`);
          return {
            name: 'Fortal Play',
            title: serverName,
            url: proxyUrl // Entrega o link do nosso addon para o Stremio
          };
        }
        return null;
      })
      .catch(() => null);
    });

    const resolvedStreams = await Promise.all(streamPromises);
    const finalStreams = resolvedStreams.filter(stream => stream !== null);
    console.log(`[HANDLER] Retornando ${finalStreams.length} streams para o Stremio.`);
    return Promise.resolve({ streams: finalStreams });

  } catch (error) {
    return Promise.resolve({ streams: [] });
  }
});

// --- SERVIDOR EXPRESS COM O PROXY ---
const app = express();
const addonInterface = builder.getInterface();

// Endpoint do manifest e do addon
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(addonInterface.manifest);
});
app.get('/:resource/:type/:id/:extra?.json', (req, res) => {
  const { resource, type, id, extra } = req.params;
  const args = { resource, type, id, extra: extra ? JSON.parse(extra) : {} };
  addonInterface.get(args).then(resp => {
    res.setHeader('Content-Type', 'application/json');
    res.send(resp);
  }).catch(err => {
    res.status(500).send({ err: 'handler error' });
  });
});

// 3. O ENDPOINT DO PROXY REVERSO
app.get('/stream/:url.mp4', async (req, res) => {
  try {
    const encodedUrl = req.params.url;
    const finalVideoUrl = Buffer.from(encodedUrl, 'base64').toString('ascii');
    console.log(`[PROXY] Recebida requisição do Stremio para o link: ${finalVideoUrl}`);

    // Faz a requisição para o link final da Superflix
    const videoResponse = await fetch(finalVideoUrl, {
      headers: { 'Referer': 'https://superflixapi.digital/' }
    });

    if (!videoResponse.ok) {
      console.error(`[PROXY] Erro ao buscar o vídeo final. Status: ${videoResponse.status}`);
      return res.status(videoResponse.status).send('Erro no servidor de vídeo');
    }

    // Retransmite os cabeçalhos (Content-Type, Content-Length, etc.)
    res.writeHead(videoResponse.status, Object.fromEntries(videoResponse.headers.entries()));
    // Retransmite o corpo do vídeo (o fluxo de dados)
    videoResponse.body.pipe(res);
    console.log(`[PROXY] Retransmitindo fluxo de vídeo para o Stremio...`);

  } catch (error) {
    console.error('[PROXY] Erro crítico no proxy reverso:', error);
    res.status(500).send('Erro interno no proxy');
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`[INFO] Addon e Proxy rodando na porta ${PORT}`);
});
                                                   
