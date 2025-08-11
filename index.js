// Importações - com a correção crucial do 'cheerio'
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio'; // Import correto para ESM, como você apontou.

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.finalissimo',
  version: '17.1.0', // Versão com a sintaxe de import corrigida
  name: 'Fortal Play (Superflix)',
  description: 'Busca de filmes/séries e todas as fontes (Dub/Leg) da Superflix.',
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
    const res = await fetch(url);
    const data = await res.json();
    const metas = data.results
      .filter(item => item.poster_path)
      .map(item => ({
        id: `tmdb:${item.id}`,
        type,
        name: item.title || item.name,
        poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
      }));
    return Promise.resolve({ metas });
  } catch (e) {
    return Promise.resolve({ metas: [] });
  }
});

// 2. HANDLER DE STREAMS (A VERSÃO COMPLETA)
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[LOG] Stream: Iniciando processo para ID "${id}".`);
  
  let imdbId = id;

  if (id.startsWith('tmdb:')) {
    const tmdbId = id.split(':')[1];
    const findUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${API_KEY}`;
    try {
      const res = await fetch(findUrl);
      const externalIds = await res.json();
      imdbId = externalIds.imdb_id;
    } catch(e) { return Promise.resolve({ streams: [] }); }
  }

  if (!imdbId || !imdbId.startsWith('tt')) {
    return Promise.resolve({ streams: [] });
  }

  try {
    const superflixType = type === 'movie' ? 'filme' : 'serie';
    const pageUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
    console.log(`[LOG] Passo 1: Acessando página HTML em ${pageUrl}`);
    
    const pageResponse = await fetch(pageUrl);
    const html = await pageResponse.text();

    const $ = cheerio.load(html);
    const serverElements = $('.player_select_item');

    if (serverElements.length === 0) {
      return Promise.resolve({ streams: [] });
    }
    console.log(`[LOG] Passo 2: Encontrados ${serverElements.length} servidores.`);

    const allStreams = [];

    for (const element of serverElements) {
      const serverId = $(element).data('id');
      const serverName = $(element).find('.player_select_name').text().trim();
      
      if (serverId === 'fake-legendado') {
          const legendadoUrl = `https://superflixapi.digital/fIlme/${imdbId}`;
          allStreams.push({
              title: `Fortal Play (Legendado Beta)`,
              url: legendadoUrl,
              behaviorHints: { notWebReady: true, isFrame: true }
          });
          continue;
      }

      if (!serverId) continue;

      const apiUrl = 'https://superflixapi.digital/api';
      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=getPlayer&video_id=${serverId}`
      });

      const data = await apiResponse.json();

      if (data.success && data.data?.video_url) {
        const finalVideoUrl = data.data.video_url;
        allStreams.push({
          title: `Fortal Play (${serverName})`,
          url: finalVideoUrl,
          behaviorHints: { notWebReady: true }
        });
      }
    }

    console.log(`[LOG] Final: Retornando um total de ${allStreams.length} links.`);
    return Promise.resolve({ streams: allStreams });

  } catch (error) {
    console.error('[ERRO] Falha crítica no processo da Superflix.', error);
    return Promise.resolve({ streams: [] });
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
serveHTTP(builder.getInterface(), { port: PORT })
  .then(() => {
    console.log(`[INFO] Addon iniciado com sucesso na porta ${PORT}.`);
  })
  .catch(err => {
    console.error(err);
  });
          
