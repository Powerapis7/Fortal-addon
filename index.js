// Importações
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';
// Cheerio não é mais necessário!

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.iframe',
  version: '18.0.0', // Versão final com Iframe
  name: 'Fortal Play (Superflix)',
  description: 'Addon que integra o player da Superflix diretamente no Stremio.',
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

// 2. HANDLER DE STREAMS (LÓGICA FINAL COM IFRAME)
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[LOG] Stream: Iniciando processo para ID "${id}".`);
  
  let imdbId = id;

  // CORREÇÃO PARA SÉRIES: Pega apenas a parte do ID do IMDb
  if (id.includes(':')) {
      imdbId = id.split(':')[0];
  }

  // Se o ID original era do TMDb, converte para IMDb
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
    console.log(`[AVISO] ID final inválido: ${imdbId}`);
    return Promise.resolve({ streams: [] });
  }

  // Monta a URL do player da Superflix
  const superflixType = type === 'movie' ? 'filme' : 'serie';
  const playerUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
  
  console.log(`[LOG] Montando stream de Iframe para a URL: ${playerUrl}`);

  // Cria o stream do tipo 'iframe'
  const streams = [{
    title: 'Assistir no Fortal Play',
    description: 'Player da Superflix',
    // 'externalUrl' é usado para dizer ao Stremio para embutir esta página
    externalUrl: playerUrl,
    // Dica de comportamento para o Stremio
    behaviorHints: {
      // 'notWebReady' pode ajudar na compatibilidade com apps de desktop
      notWebReady: true
    }
  }];

  return Promise.resolve({ streams });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
serveHTTP(builder.getInterface(), { port: PORT })
  .then(() => {
    console.log(`[INFO] Addon iniciado com sucesso na porta ${PORT}.`);
  })
  .catch(err => {
    console.error(err);
  });
