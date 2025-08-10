import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';

const { addonBuilder, serveHTTP } = sdk;


// Sua chave da API do TMDb
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play',
  version: '1.1.0', // Versão com a lógica de stream corrigida
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
      .filter(item => item.poster_path) // Filtra resultados sem poster
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

// Handler de Streams (Links) - Lógica corrigida com a API Superflix
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`Recebida requisição de stream para: ${id}`);
  
  const [_, tmdbId] = id.split(':');
  if (!tmdbId) {
    return Promise.resolve({ streams: [] });
  }

  const superflixType = type === 'movie' ? 'filme' : 'serie';

  try {
    // 1. Buscar na API da Superflix usando o ID do TMDb para obter o 'slug'
    const searchUrl = `https://superflixapi.digital/api/v1/search?tmdb_id=${tmdbId}&type=${superflixType}`;
    console.log(`Buscando slug na Superflix API: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl);
    // Checa se a resposta da API foi bem sucedida
    if (!searchResponse.ok) {
        console.log(`Superflix API respondeu com status: ${searchResponse.status}`);
        return Promise.resolve({ streams: [] });
    }
    const searchData = await searchResponse.json();

    // 2. Verificar se a API encontrou o conteúdo e se temos um slug
    if (!searchData || !searchData.slug) {
      console.log(`Conteúdo com TMDb ID ${tmdbId} não encontrado na Superflix API.`);
      return Promise.resolve({ streams: [] });
    }

    const slug = searchData.slug;
    console.log(`Slug encontrado: ${slug}`);

    // 3. Montar a URL final de streaming usando o slug
    const streamUrl = `https://superflix.mov/${superflixType}/${slug}`;

    // 4. Retornar o stream para o Stremio
    const streams = [{
      title: 'Assistir no Superflix',
      description: 'Fonte externa',
      externalUrl: streamUrl,
    }];

    return Promise.resolve({ streams });

  } catch (error) {
    console.error(`Erro ao buscar stream da Superflix para TMDb ID ${tmdbId}:`, error);
    return Promise.resolve({ streams: [] });
  }
});

// --- SERVIDOR ---
const PORT = process.env.PORT || 3000;

serveHTTP(builder.getInterface(), { port: PORT })
  .then(({ url }) => {
    console.log(`Addon rodando em: ${url}`);
    console.log(`Para instalar, use o link do seu deploy, como: https://fortal-addon.onrender.com/manifest.json`);
  })
  .catch(err => {
    console.error('Erro ao iniciar o servidor:', err);
  });
