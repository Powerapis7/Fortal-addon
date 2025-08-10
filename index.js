import express from 'express';
import fetch from 'node-fetch';
import { addonBuilder } from 'stremio-addon-sdk';

// Sua chave da API do TMDb
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';

// 1. CORREÇÃO: Definição do Manifest
//    - Removida a duplicata da propriedade 'catalogs'.
//    - Adicionado 'search' como 'true' para indicar que os catálogos suportam busca.
const manifest = {
  id: 'org.test.fortalplay',
  version: '1.0.0',
  name: 'Fortal Play',
  description: 'Addon Fortal Play com busca TMDb e streaming via Superflix',
  resources: ['catalog', 'meta', 'stream'], // Adicionado 'stream' para ser explícito
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'tmdb_movies',
      name: 'Busca de Filmes', // Nome mais descritivo
      extra: [{ name: 'search', isRequired: true }] // Habilita a barra de busca
    },
    {
      type: 'series',
      id: 'tmdb_series',
      name: 'Busca de Séries', // Nome mais descritivo
      extra: [{ name: 'search', isRequired: true }] // Habilita a barra de busca
    }
  ],
};

const builder = new addonBuilder(manifest);

// Handler do Catálogo (Busca)
// Nenhuma grande mudança aqui, mas o manifest corrigido faz ele funcionar.
builder.defineCatalogHandler(async ({ type, extra }) => {
  console.log('Recebida requisição de catálogo:', { type, extra });

  if (!extra || !extra.search) {
    console.log('Busca vazia, retornando nada.');
    return Promise.resolve({ metas: [] });
  }

  const query = extra.search;
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}&page=1`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return Promise.resolve({ metas: [] });
    }

    const metas = data.results.map(item => ({
      id: `tmdb:${tmdbType}:${item.id}`, // Formato de ID mais robusto: tmdb:movie:123
      type,
      name: item.title || item.name,
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://files.catbox.moe/jwtaje.jpg',
      description: item.overview,
    }));

    console.log(`Encontrados ${metas.length} resultados para "${query}"`);
    return Promise.resolve({ metas });
  } catch (e) {
    console.error('Erro na busca TMDb:', e);
    return Promise.resolve({ metas: [] });
  }
});

// 2. CORREÇÃO: Handler de Streams
//    - Adicionado um handler separado para streams, que é a prática correta.
//    - A URL do Superflix é um placeholder, pois a API real não foi encontrada.
builder.defineStreamHandler(async ({ type, id }) => {
  console.log('Recebida requisição de stream para:', { type, id });

  // Extrai o ID do TMDB do nosso formato de ID (ex: "tmdb:movie:123")
  const [_, mediaType, tmdbId] = id.split(':');

  if (!tmdbId) {
    return Promise.resolve({ streams: [] });
  }

  // AVISO: A URL abaixo é um PALPITE. A API Superflix não é documentada.
  // Pode ser necessário usar "web scraping" ou outra técnica para obter o link real.
  let streamUrl;
  if (type === 'movie') {
    // Exemplo: link direto para um player externo
    streamUrl = `https://superflix.mov/filme/${tmdbId}`; // URL hipotética
  } else if (type === 'series') {
    // Para séries, o Stremio precisa de links por episódio.
    // Este exemplo simples apenas aponta para a página principal da série.
    streamUrl = `https://superflix.mov/serie/${tmdbId}`; // URL hipotética
  }

  if (!streamUrl) {
    return Promise.resolve({ streams: [] });
  }

  const streams = [{
    title: 'Assistir no Fortal Play (Externo)',
    // 'externalUrl' abre o link no navegador em vez de tentar tocar no Stremio
    externalUrl: streamUrl,
  }];

  return Promise.resolve({ streams });
});


// Handler de Metadados (Informações do filme/série)
// Nenhuma grande mudança aqui, apenas usando o novo formato de ID.
builder.defineMetaHandler(async ({ type, id }) => {
  console.log('Recebida requisição de metadados para:', { type, id });

  const [_, mediaType, tmdbId] = id.split(':');
  if (!tmdbId) return Promise.resolve(null);

  const urlApi = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${API_KEY}&language=pt-BR`;

  try {
    const res = await fetch(urlApi);
    const data = await res.json();

    const meta = {
      id: id,
      type: type,
      name: data.title || data.name,
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      background: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
      description: data.overview,
      // ... outros metadados que você queira adicionar
    };
    return Promise.resolve({ meta });
  } catch (e) {
    console.error('Erro ao buscar metadados:', e);
    return Promise.resolve(null);
  }
});


// 3. CORREÇÃO: Criação do Servidor Express
//    - A forma correta de obter a interface é usando builder.getAddon().getInterface()
const { getInterface } = builder.getAddon();
const app = express();

// Middleware para servir a interface do addon
app.use((req, res, next) => {
  // Adiciona o header CORS para permitir que o Stremio acesse o addon de qualquer lugar
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.get('/manifest.json', (req, res) => {
  res.send(manifest);
});

// Todas as outras rotas (/catalog, /meta, /stream) são tratadas pela interface
app.get('/:resource/:type/:id.json', (req, res) => {
  const { resource, type, id } = req.params;
  getInterface({ resource, type, id, extra: req.query })
    .then(content => {
      res.send(content);
    })
    .catch(err => {
      console.error(err);
      res.status(500).send({ err: 'handler error' });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Addon rodando. Para instalar, copie e cole este link no Stremio:`);
  console.log(`http://127.0.0.1:${PORT}/manifest.json`);
});
