// Importações no padrão ES Module
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
// Usando a chave de API que você forneceu.
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
// Mudei a versão para '5.0.0' para garantir que o Stremio veja como uma grande atualização.
const manifest = {
  id: 'org.fortal.play.v5',
  version: '5.0.0',
  name: 'Fortal Play',
  description: 'Addon de busca com links externos para o Superflix.',
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

// --- LÓGICA DO ADDON (HANDLERS) ---
const builder = new addonBuilder(manifest);

// Handler de Catálogo (Busca)
builder.defineCatalogHandler(async ({ type, extra }) => {
  const query = extra?.search;
  console.log(`[LOG] Catálogo: Recebida busca por "${query}" no tipo "${type}".`);

  if (!query) {
    return Promise.resolve({ metas: [] });
  }

  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.success === false) {
      console.error(`[ERRO] Catálogo: TMDb API retornou um erro: ${data.status_message}`);
      return Promise.resolve({ metas: [] });
    }

    const metas = data.results
      .filter(item => item.poster_path)
      .map(item => ({
        id: `tmdb:${item.id}`,
        type,
        name: item.title || item.name,
        poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
      }));
    
    console.log(`[LOG] Catálogo: Retornando ${metas.length} resultados para o Stremio.`);
    return Promise.resolve({ metas });
  } catch (e) {
    console.error('[ERRO FATAL] Catálogo: Falha na chamada ao TMDb.', e);
    return Promise.resolve({ metas: [] });
  }
});

// Handler de Metadados (Detalhes)
builder.defineMetaHandler(async ({ type, id }) => {
  if (!id.startsWith('tmdb:')) return Promise.resolve({ meta: null });
  
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

// Handler de Streams (Links)
builder.defineStreamHandler(async ({ type, id }) => {
  if (!id.startsWith('tmdb:')) return Promise.resolve({ streams: [] });

  const [_, tmdbId] = id.split(':');
  const superflixType = type === 'movie' ? 'filme' : 'serie';

  try {
    const searchUrl = `https://superflixapi.digital/api/v1/search?tmdb_id=${tmdbId}&type=${superflixType}`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) return Promise.resolve({ streams: [] });

    const searchData = await searchResponse.json();
    if (!searchData?.slug) return Promise.resolve({ streams: [] });

    const slug = searchData.slug;
    const streamUrl = `https://superflix.mov/${superflixType}/${slug}`;
    const streams = [{ title: 'Assistir no Fortal Play', externalUrl: streamUrl }];
    return Promise.resolve({ streams });
  } catch (error) {
    return Promise.resolve({ streams: [] });
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
serveHTTP(builder.getInterface(), { port: PORT })
  .then(({ url }) => {
    console.log(`[INFO] Addon iniciado com sucesso na porta ${PORT}.`);
  })
  .catch(err => {
    console.error(err);
  });
                  
