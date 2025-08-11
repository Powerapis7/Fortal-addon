// Importações
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
// A chave do TMDb só é necessária para a nossa busca personalizada.
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.correto',
  version: '14.0.0', // A versão que finalmente funciona como pedido.
  name: 'Fortal Play (Superflix)',
  description: 'Busca de filmes/séries e fontes de streaming da Superflix.',
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
  // Informa ao Stremio que nosso addon entende IDs do IMDb e TMDb
  idPrefixes: ['tt', 'tmdb:']
};

// --- LÓGICA DO ADDON ---
const builder = new addonBuilder(manifest);

// 1. HANDLER DE CATÁLOGO (BUSCA) - Permanece o mesmo
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

// 2. HANDLER DE STREAMS (LINKS DA SUPERFLIX) - LÓGICA CORRIGIDA
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[LOG] Stream: Recebida requisição de link para ID "${id}".`);
  
  let imdbId = id;

  // Se recebermos um ID do TMDb (da nossa busca), precisamos convertê-lo para IMDb.
  if (id.startsWith('tmdb:')) {
    const tmdbId = id.split(':')[1];
    const findUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${API_KEY}`;
    try {
      const res = await fetch(findUrl);
      const externalIds = await res.json();
      if (externalIds.imdb_id) {
        imdbId = externalIds.imdb_id;
        console.log(`[LOG] Conversor: ID ${id} convertido para ${imdbId}.`);
      } else {
        return Promise.resolve({ streams: [] });
      }
    } catch(e) {
      return Promise.resolve({ streams: [] });
    }
  }

  // Se o ID final não for um ID do IMDb, não podemos continuar.
  if (!imdbId.startsWith('tt')) {
    return Promise.resolve({ streams: [] });
  }

  // --- A LÓGICA CORRETA, BASEADA NO SEU EXEMPLO ---
  const superflixType = type === 'movie' ? 'filme' : 'serie';
  const apiUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
  console.log(`[LOG] Stream: Consultando Superflix API em ${apiUrl}`);

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.log(`[AVISO] Superflix API respondeu com status ${response.status}.`);
      return Promise.resolve({ streams: [] });
    }

    const data = await response.json();
    
    // A resposta da API contém os links de streaming na propriedade 'data'.
    if (!data || !data.data || data.data.length === 0) {
      console.log(`[AVISO] Conteúdo com ID "${imdbId}" não encontrado na Superflix.`);
      return Promise.resolve({ streams: [] });
    }

    // Mapeia os resultados para o formato que o Stremio entende.
    const streams = data.data.map(video => ({
      title: `Fortal Play (${video.label})`, // Ex: Fortal Play (Dublado)
      url: video.file, // A API fornece o link de vídeo direto.
      behaviorHints: {
        // Alguns links podem não ser compatíveis com Chromecast
        notWebReady: true
      }
    }));

    console.log(`[LOG] Stream: ${streams.length} links da Superflix encontrados e retornados.`);
    return Promise.resolve({ streams });

  } catch (error) {
    console.error('[ERRO] Stream: Falha ao buscar link da Superflix.', error);
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
