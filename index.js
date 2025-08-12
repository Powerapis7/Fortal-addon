// Importações
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import express from 'express'; // Ainda necessário para tipagem, mas não criamos um novo app

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;
const PUBLIC_URL = 'https://fortal-addon.onrender.com';  // URL pública para produção

// Cache para cookies e pageUrl por serverId (use Map para armazenamento temporário)
const cache = new Map();

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.documentacao',
  version: '27.0.0', // A versão baseada na documentação oficial
  name: 'Fortal Play (Superflix)',
  description: 'Addon que usa o método correto para tocar links HTTPS no Stremio.',
  logo: 'https://files.catbox.moe/jwtaje.jpg',
  resources: ['catalog', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'fortal-search-movies',
      name: 'Busca Fortal Filmes',
      extra: [{ name: 'search', isRequired: true }]
    },
    {
      type: 'series',
      id: 'fortal-search-series',
      name: 'Busca Fortal Séries',
      extra: [{ name: 'search', isRequired: true }]
    }
  ],
  idPrefixes: ['tt', 'tmdb:']
};

// --- LÓGICA DO ADDON ---
const builder = new addonBuilder(manifest);

// 1. HANDLER DE CATÁLOGO (BUSCA)
builder.defineCatalogHandler(async ({ type, extra }) => {
  const query = extra?.search;
  if (!query) return Promise.resolve({ metas: [] });
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;
  try {
    console.log(`[INFO] Buscando catálogo para query: ${query}`);
    const res = await fetch(url);
    const data = await res.json();
    const metas = data.results.filter(i => i.poster_path).map(i => ({ id: `tmdb:${i.id}`, type, name: i.title || i.name, poster: `https://image.tmdb.org/t/p/w500${i.poster_path}` }));
    console.log(`[INFO] Encontrados ${metas.length} itens no catálogo`);
    return Promise.resolve({ metas });
  } catch (e) {
    console.error(`[ERROR] Erro ao buscar catálogo: ${e.message}`);
    return Promise.resolve({ metas: [] });
  }
});

// 2. HANDLER DE STREAMS (IMPLEMENTANDO A DOCUMENTAÇÃO)
builder.defineStreamHandler(async ({ type, id }) => {
  let imdbId = id.includes(':') ? id.split(':')[0] : id;

  if (imdbId.startsWith('tmdb:')) {
    const tmdbId = imdbId.split(':')[1];
    const findUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${API_KEY}`;
    try {
      console.log(`[INFO] Convertendo TMDB ID ${tmdbId} para IMDB ID`);
      const res = await fetch(findUrl);
      const externalIds = await res.json();
      imdbId = externalIds.imdb_id;
      console.log(`[INFO] IMDB ID encontrado: ${imdbId}`);
    } catch(e) {
      console.error(`[ERROR] Erro ao converter TMDB para IMDB: ${e.message}`);
      return Promise.resolve({ streams: [] });
    }
  }

  if (!imdbId || !imdbId.startsWith('tt')) return Promise.resolve({ streams: [] });

  try {
    const superflixType = type === 'movie' ? 'filme' : 'serie';
    const pageUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
    console.log(`[INFO] Fetching page: ${pageUrl}`);
    const pageResponse = await fetch(pageUrl);
    const html = await pageResponse.text();
    const cookies = pageResponse.headers.get('set-cookie');

    if (!cookies) {
      console.log(`[WARN] Nenhum cookie encontrado para ${pageUrl}`);
      return Promise.resolve({ streams: [] });
    }

    const $ = cheerio.load(html);
    const serverElements = $('.player_select_item');
    if (serverElements.length === 0) {
      console.log(`[WARN] Nenhum server encontrado para ${imdbId}`);
      return Promise.resolve({ streams: [] });
    }

    const streamPromises = [];

    for (const element of serverElements) {
      const serverId = $(element).data('id');
      const serverName = $(element).find('.player_select_name').text().trim();
      
      if (!serverId || serverId === 'fake-legendado') continue;

      console.log(`[INFO] Processando serverId: ${serverId} (${serverName})`);

      // Cache os dados necessários para o proxy
      cache.set(serverId, { cookies, pageUrl });

      const promise = fetch('https://superflixapi.digital/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies, 'Referer': pageUrl },
        body: `action=getPlayer&video_id=${serverId}`
      })
      .then(res => res.json())
      .then(data => {
        if (data.message === 'success' && data.data?.video_url) {
          console.log(`[INFO] Video URL obtido para ${serverId}: ${data.data.video_url}`);
          // Retorne a URL de proxy usando a URL pública
          return {
            name: 'Fortal Play',
            title: serverName,
            url: `${PUBLIC_URL}/proxy/${serverId}`,
            behaviorHints: {
              notWebReady: false  // Assumindo MP4 direto; ajuste se necessário
            }
          };
        }
        console.log(`[WARN] Falha ao obter video para ${serverId}`);
        return null;
      })
      .catch(e => {
        console.error(`[ERROR] Erro ao processar server ${serverId}: ${e.message}`);
        return null;
      });
      streamPromises.push(promise);
    }

    const resolvedStreams = await Promise.all(streamPromises);
    const finalStreams = resolvedStreams.filter(stream => stream !== null);
    console.log(`[INFO] Streams finais encontrados: ${finalStreams.length}`);
    return Promise.resolve({ streams: finalStreams });

  } catch (error) {
    console.error(`[ERROR] Erro geral no handler de streams: ${error.message}`);
    return Promise.resolve({ streams: [] });
  }
});

// Adicione a rota de proxy ao router interno do addon
const router = builder.getRouter();
router.get('/proxy/:serverId', async (req, res) => {
  const serverId = req.params.serverId;
  console.log(`[INFO] Requisição de proxy para serverId: ${serverId}`);

  const cachedData = cache.get(serverId);
  if (!cachedData) {
    console.log(`[WARN] Dados em cache não encontrados para ${serverId}`);
    return res.status(404).send('Dados não encontrados');
  }

  const { cookies, pageUrl } = cachedData;

  try {
    // Refaça a requisição à API para obter video_url
    console.log(`[INFO] Fetching video_url para ${serverId}`);
    const apiResponse = await fetch('https://superflixapi.digital/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies, 'Referer': pageUrl },
      body: `action=getPlayer&video_id=${serverId}`
    });
    const data = await apiResponse.json();
    const videoUrl = data.data.video_url;

    if (!videoUrl) {
      console.log(`[WARN] Video URL não encontrado para ${serverId}`);
      return res.status(404).send('Video not found');
    }

    console.log(`[INFO] Fetching video de ${videoUrl}`);
    // Fetch o video_url com headers e pipe para o response
    const videoResponse = await fetch(videoUrl, {
      method: 'GET',
      headers: {
        'Referer': pageUrl,  // Adicione Referer se requerido
        // 'User-Agent': 'Mozilla/5.0 ...'  // Descomente se necessário para simular desktop
      }
    });

    if (!videoResponse.ok) {
      console.error(`[ERROR] Falha ao fetch video: status ${videoResponse.status}`);
      return res.status(videoResponse.status).send('Failed to fetch video');
    }

    // Configure headers para Stremio
    res.setHeader('Content-Type', videoResponse.headers.get('Content-Type') || 'video/mp4');
    res.setHeader('Content-Length', videoResponse.headers.get('Content-Length'));
    res.setHeader('Accept-Ranges', 'bytes');

    // Pipe o stream
    videoResponse.body.pipe(res);
    console.log(`[INFO] Streaming iniciado para ${serverId}`);

    // Limpe o cache após uso (opcional, para evitar memória excessiva)
    cache.delete(serverId);
  } catch (error) {
    console.error(`[ERROR] Erro no proxy para ${serverId}: ${error.message}`);
    res.status(500).send('Proxy error');
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
serveHTTP(builder.getInterface(), { port: PORT })
  .then(() => {
    console.log(`[INFO] Addon iniciado com sucesso na porta ${PORT}.`);
  })
  .catch(err => {
    console.error(`[ERROR] Erro ao iniciar servidor: ${err.message}`);
  });
