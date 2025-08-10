import express from 'express';
import fetch from 'node-fetch'; // se não tiver instalado, use: npm install node-fetch
import { addonBuilder } from 'stremio-addon-sdk';

const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';

const manifest = {
  id: 'org.test.fortalplay',
  version: '1.0.0',
  name: 'Fortal Play',
  description: 'Addon Fortal Play com busca TMDb e streaming via Superflix',
  resources: ['catalog', 'meta'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'tmdb_movies' },
    { type: 'series', id: 'tmdb_series' }
  ],
  catalogs: [],
};

const builder = new addonBuilder(manifest);

// Handler da busca (catalog)
builder.defineCatalogHandler(async ({ type, extra }) => {
  if (!extra || !extra.search) return { metas: [] };

  const query = extra.search;
  const tmdbType = type === 'series' ? 'tv' : 'movie';

  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}&page=1`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) return { metas: [] };

    const metas = data.results.map(item => ({
      id: `${tmdbType}_${item.id}`,
      type,
      name: item.title || item.name,
      poster: 'https://files.catbox.moe/jwtaje.jpg', // Sua imagem fixa aqui
      description: item.overview,
      released: item.release_date || item.first_air_date,
      imdbRating: item.vote_average,
      posterShape: 'poster',
    }));

    return { metas };
  } catch (e) {
    return { metas: [] };
  }
});

// Handler do meta e streams
builder.defineMetaHandler(async ({ type, id }) => {
  const [mediaType, tmdbId] = id.split('_');
  if (!tmdbId) return null;

  const urlApi = `https://api.themoviedb.org/3/${mediaType === 'series' ? 'tv' : 'movie'}/${tmdbId}?api_key=${API_KEY}&language=pt-BR`;
  try {
    const res = await fetch(urlApi);
    const data = await res.json();

    let streams = [];
    if (mediaType === 'movie') {
      streams.push({
        title: 'Fortal Play',
        url: `https://superflixapi.ps/filme/${tmdbId}`,
        externalUrl: true,
      });
    } else if (mediaType === 'series') {
      streams.push({
        title: 'Fortal Play',
        url: `https://superflixapi.ps/serie/${tmdbId}/1/1`,
        externalUrl: true,
      });
    }

    return {
      id,
      type: mediaType === 'series' ? 'series' : 'movie',
      name: data.title || data.name,
      description: data.overview,
      released: data.release_date || data.first_air_date,
      poster: 'https://files.catbox.moe/jwtaje.jpg', // imagem fixa
      background: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
      imdbRating: data.vote_average,
      genres: data.genres ? data.genres.map(g => g.name) : [],
      streams,
    };
  } catch (e) {
    return null;
  }
});

const app = express();
const addonInterface = builder.getInterface();

app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

app.use('/', (req, res) => {
  addonInterface(req, res);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Addon Fortal Play rodando em http://localhost:${PORT}/manifest.json`);
});
