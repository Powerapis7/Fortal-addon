// Importações - com o import correto do cheerio que você me ensinou
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.definitivo',
  version: '21.0.0', // A versão que implementa a lógica correta
  name: 'Fortal Play (Superflix)',
  description: 'Busca e fornece links diretos (Dub/Leg) da Superflix.',
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

// 2. HANDLER DE STREAMS (A LÓGICA FINAL E CORRETA)
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[LOG] Stream: Iniciando processo para ID "${id}".`);
  
  let imdbId = id;

  // CORREÇÃO PARA SÉRIES: Pega apenas a parte do ID do IMDb
  if (id.includes(':')) {
      imdbId = id.split(':')[0];
  }

  if (imdbId.startsWith('tmdb:')) {
    const tmdbId = imdbId.split(':')[1];
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
    // PASSO 1: ACESSAR A PÁGINA HTML
    const superflixType = type === 'movie' ? 'filme' : 'serie';
    const pageUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
    console.log(`[LOG] Passo 1: Acessando página HTML em ${pageUrl}`);
    
    const pageResponse = await fetch(pageUrl);
    const html = await pageResponse.text();

    // PASSO 2: ANALISAR O HTML E ENCONTRAR TODOS OS SERVIDORES
    const $ = cheerio.load(html);
    const serverElements = $('.player_select_item');

    if (serverElements.length === 0) {
      return Promise.resolve({ streams: [] });
    }
    console.log(`[LOG] Passo 2: Encontrados ${serverElements.length} servidores na página.`);

    const streamPromises = [];

    // PASSO 3: PARA CADA SERVIDOR, BUSCAR O LINK DE VÍDEO
    for (const element of serverElements) {
      const serverId = $(element).data('id');
      const serverName = $(element).find('.player_select_name').text().trim();
      
      if (!serverId || serverId === 'fake-legendado') continue; // Ignora o legendado beta por enquanto

      const promise = fetch('https://superflixapi.digital/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=getPlayer&video_id=${serverId}`
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.video_url) {
          console.log(`[LOG] SUCESSO! Link obtido para "${serverName}".`);
          return {
            title: `Fortal Play (${serverName})`,
            url: data.data.video_url,
            behaviorHints: { notWebReady: true }
          };
        }
        return null;
      })
      .catch(err => {
        console.log(`[AVISO] Falha ao processar servidor ${serverId}.`);
        return null;
      });
      streamPromises.push(promise);
    }

    // PASSO 4: ESPERAR TODAS AS BUSCAS TERMINAREM E FILTRAR OS RESULTADOS
    const resolvedStreams = await Promise.all(streamPromises);
    const finalStreams = resolvedStreams.filter(stream => stream !== null); // Remove os que falharam

    if (finalStreams.length === 0) {
        console.log(`[AVISO] Final: Nenhum link de vídeo válido foi obtido.`);
        return Promise.resolve({ streams: [] });
    }

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
