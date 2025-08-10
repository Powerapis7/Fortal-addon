// Importações necessárias
import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import fetch from 'node-fetch';

// Sua chave da API do TMDb
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';

// --- MANIFEST ---
// Adicionado o logo e incrementada a versão.
const manifest = {
  id: 'org.fortal.play',
  version: '1.0.2', // Versão atualizada
  name: 'Fortal Play',
  description: 'Addon de busca no TMDb com links externos para streaming.',
  
  // Ícone do addon
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
  if (!extra?.search) {
    return Promise.resolve({ metas: [] });
  }

  const query = extra.search;
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const metas = data.results
      .filter(item => item.poster_path) // Filtra resultados sem poster para uma UI mais limpa
      .map(item => ({
        id: `tmdb:${item.id}`,
        type,
        name: item.title || item.name,
        poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
      }));

    return Promise.resolve({ metas });
  } catch (e) {
    console.error('Erro no handler de catálogo:', e);
    return Promise.resolve({ metas: [] });
  }
});

// Handler de Metadados (Detalhes)
builder.defineMetaHandler(async ({ type, id }) => {
  const [_, tmdbId] = id.split(':');
  if (!tmdbId) return Promise.resolve({ meta: null });

  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${API_KEY}&language=pt-BR`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const meta = {
      id: id,
      type: type,
      name: data.title || data.name,
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      background: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
      description: data.overview,
      imdbRating: data.vote_average || null,
      releaseInfo: data.release_date || data.first_air_date || null,
    };
    return Promise.resolve({ meta });
  } catch (e) {
    console.error('Erro no handler de metadados:', e);
    return Promise.resolve({ meta: null });
  }
});

// Handler de Streams (Links)
builder.defineStreamHandler(async ({ type, id }) => {
  const [_, tmdbId] = id.split(':');
  if (!tmdbId) return Promise.resolve({ streams: [] });

  // AVISO: A URL do Superflix é um palpite. Pode não funcionar.
  let streamUrl;
  if (type === 'movie') {
    streamUrl = `https://superflix.mov/filme/${tmdbId}`;
  } else if (type === 'series') {
    streamUrl = `https://superflix.mov/serie/${tmdbId}`;
  }

  if (!streamUrl) return Promise.resolve({ streams: [] });

  const streams = [{
    title: 'Assistir (Fonte Externa)',
    externalUrl: streamUrl,
  }];

  return Promise.resolve({ streams });
});

// --- SERVIDOR ---
const PORT = process.env.PORT || 3000;

serveHTTP(builder.getInterface(), { port: PORT })
  .then(({ url }) => {
    console.log(`Addon rodando em: ${url}`);
    console.log(`Para deploy, use o link público, como: https://fortal-addon.onrender.com/manifest.json`);
  })
  .catch(err => {
    console.error('Erro ao iniciar o servidor:', err);
  });
