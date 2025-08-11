// Importações
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.vitoria',
  version: '25.0.0', // A versão da vitória
  name: 'Fortal Play (Superflix)',
  description: 'Busca e fornece todos os links diretos (Dub/Leg) da Superflix.',
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
    const metas = data.results.filter(i => i.poster_path).map(i => ({ id: `tmdb:${i.id}`, type, name: i.title || i.name, poster: `https://image.tmdb.org/t/p/w500${i.poster_path}` }));
    return Promise.resolve({ metas });
  } catch (e) { return Promise.resolve({ metas: [] }); }
});

// 2. HANDLER DE STREAMS (A LÓGICA COMPROVADA)
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[LOG] Stream: Iniciando processo de sessão para ID "${id}".`);
  
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
    // PASSO 1: VISITAR A PÁGINA E CAPTURAR O COOKIE DE SESSÃO
    const superflixType = type === 'movie' ? 'filme' : 'serie';
    const pageUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
    console.log(`[LOG] Passo 1: Acessando ${pageUrl} para obter cookie.`);
    
    const pageResponse = await fetch(pageUrl);
    const html = await pageResponse.text();
    const cookies = pageResponse.headers.get('set-cookie');

    if (!cookies) {
      console.log('[AVISO] Não foi possível obter o cookie de sessão.');
      return Promise.resolve({ streams: [] });
    }

    // PASSO 2: ANALISAR O HTML E ENCONTRAR TODOS OS SERVIDORES
    const $ = cheerio.load(html);
    const serverElements = $('.player_select_item');
    console.log(`[LOG] Passo 2: Encontrados ${serverElements.length} servidores.`);

    const streamPromises = [];

    // PASSO 3: PARA CADA SERVIDOR, BUSCAR O LINK DE VÍDEO
    for (const element of serverElements) {
      const serverId = $(element).data('id');
      const serverName = $(element).find('.player_select_name').text().trim();
      
      if (!serverId) continue;

      if (serverId === 'fake-legendado') {
          const legendadoUrl = `https://superflixapi.digital/fIlme/${imdbId}`;
          streamPromises.push(Promise.resolve({
              title: `Fortal Play (Legendado Beta)`,
              url: legendadoUrl,
              behaviorHints: { notWebReady: true, isFrame: true }
          }));
          continue;
      }

      const promise = fetch('https://superflixapi.digital/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookies,
          'Referer': pageUrl,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        },
        body: `action=getPlayer&video_id=${serverId}`
      })
      .then(res => res.json())
      .then(data => {
        if (data.message === 'success' && data.data?.video_url) {
          return {
            title: `Fortal Play (${serverName})`,
            url: data.data.video_url,
            behaviorHints: { notWebReady: true }
          };
        }
        return null;
      })
      .catch(() => null);
      streamPromises.push(promise);
    }

    // PASSO 4: ESPERAR TODAS AS BUSCAS TERMINAREM E FILTRAR OS RESULTADOS
    const resolvedStreams = await Promise.all(streamPromises);
    const finalStreams = resolvedStreams.filter(stream => stream !== null);

    console.log(`[LOG] Final: Retornando um total de ${finalStreams.length} links diretos para o Stremio.`);
    return Promise.resolve({ streams: finalStreams });

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
          
