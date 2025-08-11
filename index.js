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
    const res = await fetch(url);
    const data = await res.json();
    const metas = data.results.filter(i => i.poster_path).map(i => ({ id: `tmdb:${i.id}`, type, name: i.title || i.name, poster: `https://image.tmdb.org/t/p/w500${i.poster_path}` }));
    return Promise.resolve({ metas });
  } catch (e) { return Promise.resolve({ metas: [] }); }
});

// 2. HANDLER DE STREAMS (IMPLEMENTANDO A DOCUMENTAÇÃO)
builder.defineStreamHandler(async ({ type, id }) => {
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

    const streamPromises = [];

    for (const element of serverElements) {
      const serverId = $(element).data('id');
      const serverName = $(element).find('.player_select_name').text().trim();
      
      if (!serverId || serverId === 'fake-legendado') continue;

      const promise = fetch('https://superflixapi.digital/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies, 'Referer': pageUrl },
        body: `action=getPlayer&video_id=${serverId}`
      })
      .then(res => res.json())
      .then(data => {
        if (data.message === 'success' && data.data?.video_url) {
          // AQUI ESTÁ A IMPLEMENTAÇÃO CORRETA DA DOCUMENTAÇÃO
          return {
            name: 'Fortal Play',
            title: serverName,
            // 'url' contém o link de vídeo HTTPS
            url: data.data.video_url,
            // 'behaviorHints' diz ao Stremio COMO lidar com este link
            behaviorHints: {
              // Esta é a chave! Diz ao Stremio para não usar o player de torrents.
              notWebReady: true
            }
          };
        }
        return null;
      })
      .catch(() => null);
      streamPromises.push(promise);
    }

    const resolvedStreams = await Promise.all(streamPromises);
    const finalStreams = resolvedStreams.filter(stream => stream !== null);

    return Promise.resolve({ streams: finalStreams });

  } catch (error) {
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
