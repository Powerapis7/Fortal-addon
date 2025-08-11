// Importações
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST OTIMIZADO ---
const manifest = {
  id: 'org.fortal.play.v6',
  version: '6.0.0', // Versão final compatível
  name: 'Fortal Play (Fontes)',
  description: 'Adiciona fontes de streaming do Superflix aos filmes e séries existentes.',
  logo: 'https://files.catbox.moe/jwtaje.jpg',
  
  // MUDANÇA CRUCIAL: Removemos 'meta'. Agora o addon só fornece catálogos e streams.
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
  // Adicionamos 'idPrefixes' para dizer ao Stremio que nosso addon responde a IDs do TMDb.
  idPrefixes: ['tmdb:']
};

// --- LÓGICA DO ADDON ---
const builder = new addonBuilder(manifest);

// Handler de Catálogo (Busca) - Permanece o mesmo
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
        id: `tmdb:${item.id}`, // O Stremio usará este ID para pedir o stream
        type,
        name: item.title || item.name,
        poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
      }));
    return Promise.resolve({ metas });
  } catch (e) {
    return Promise.resolve({ metas: [] });
  }
});

// --- defineMetaHandler foi REMOVIDO ---

// Handler de Streams (Links) - Permanece o mesmo
builder.defineStreamHandler(async ({ type, id }) => {
  // A verificação 'id.startsWith' agora é ainda mais importante.
  if (!id.startsWith('tmdb:')) {
    return Promise.resolve({ streams: [] });
  }

  console.log(`[LOG] Stream: Recebida requisição de link para ${id}.`);
  const [_, tmdbId] = id.split(':');
  const superflixType = type === 'movie' ? 'filme' : 'serie';

  try {
    const searchUrl = `https://superflixapi.digital/api/v1/search?tmdb_id=${tmdbId}&type=${superflixType}`;
    console.log(`[LOG] Stream: Consultando Superflix API em ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) return Promise.resolve({ streams: [] });

    const searchData = await searchResponse.json();
    if (!searchData?.slug) return Promise.resolve({ streams: [] });

    const slug = searchData.slug;
    const streamUrl = `https://superflix.mov/${superflixType}/${slug}`;
    const streams = [{ title: 'Assistir no Fortal Play', externalUrl: streamUrl }];
    
    console.log(`[LOG] Stream: Link encontrado e retornado: ${streamUrl}`);
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
