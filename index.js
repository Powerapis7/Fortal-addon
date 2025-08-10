// Importações no padrão ES Module
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b'; // Sua chave do TMDb
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.final',
  version: '2.1.0', // Versão final otimizada
  name: 'Fortal Play',
  description: 'Addon de busca no TMDb com links para o Superflix.',
  logo: 'https://files.catbox.moe/jwtaje.jpg',
  resources: ['catalog', 'meta', 'stream'],
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
};

// --- BUILDER E HANDLERS ---
const builder = new addonBuilder(manifest);

// Handler de Catálogo (Busca)
builder.defineCatalogHandler(async ({ type, extra }) => {
  const query = extra?.search;
  if (!query) {
    return Promise.resolve({ metas: [] });
  }
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.success === false) {
      return Promise.resolve({ metas: [] });
    }
    const metas = data.results
      .filter(item => item.poster_path)
      .map(item => ({
        id: `tmdb:${item.id}`, // Nosso addon cria IDs com o prefixo "tmdb:"
        type,
        name: item.title || item.name,
        poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
      }));
    return Promise.resolve({ metas });
  } catch (e) {
    return Promise.resolve({ metas: [] });
  }
});

// Handler de Metadados
builder.defineMetaHandler(async ({ type, id }) => {
  // Só processa se o ID for do nosso formato
  if (!id.startsWith('tmdb:')) {
    return Promise.resolve({ meta: null });
  }
  const [_, tmdbId] = id.split(':');
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${API_KEY}&language=pt-BR`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const meta = { id, type, name: data.title || data.name, poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null, background: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null, description: data.overview };
    return Promise.resolve({ meta });
  } catch (e) {
    return Promise.resolve({ meta: null });
  }
});

// Handler de Streams
builder.defineStreamHandler(async ({ type, id }) => {
  // --- A SOLUÇÃO ESTÁ AQUI ---
  // Ignora qualquer pedido cujo ID não comece com "tmdb:"
  if (!id.startsWith('tmdb:')) {
    return Promise.resolve({ streams: [] });
  }

  const [_, tmdbId] = id.split(':');
  const superflixType = type === 'movie' ? 'filme' : 'serie';
  try {
    const searchUrl = `https://superflixapi.digital/api/v1/search?tmdb_id=${tmdbId}&type=${superflixType}`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      return Promise.resolve({ streams: [] });
    }
    const searchData = await searchResponse.json();
    if (!searchData?.slug) {
      return Promise.resolve({ streams: [] });
    }
    const streamUrl = `https://superflix.mov/${superflixType}/${searchData.slug}`;
    const streams = [{ title: 'Assistir no Fortal Play', externalUrl: streamUrl }];
    return Promise.resolve({ streams });
  } catch (error) {
    return Promise.resolve({ streams: [] });
  }
});

// --- SERVIDOR ---
serveHTTP(builder.getInterface(), { port: PORT })
  .then(({ url }) => {
    console.log(`Addon iniciado. Instale em: https://<SEU-APP>.onrender.com/manifest.json`);
  })
  .catch(err => {
    console.error('Erro ao iniciar o servidor:', err);
  });
