import express from 'express';
import { addonBuilder } from 'stremio-addon-sdk';
import fetch from 'node-fetch';

const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const IMAGEM_PADRAO = 'https://i.imgur.com/UH3IPXw.png';

const manifest = {
  id: 'org.worldecletix.cine',
  version: '1.0.0',
  name: 'World Ecletix Cine',
  description: 'Addon TMDb + streaming Superflix',
  resources: ['catalog', 'meta'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'tmdb_movies' },
    { type: 'series', id: 'tmdb_series' }
  ],
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, extra }) => {
  const searchQuery = extra && extra.search;
  if (!searchQuery) return { metas: [] };

  const apiType = type === 'series' ? 'tv' : 'movie';

  const url = `https://api.themoviedb.org/3/search/${apiType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(searchQuery)}&page=1&include_adult=false`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) return { metas: [] };

    const metas = data.results.map(item => ({
      id: `${apiType}_${item.id}`,
      type: type,
      name: item.title || item.name,
      poster: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : IMAGEM_PADRAO,
      posterShape: 'poster',
      description: item.overview,
      released: item.release_date || item.first_air_date,
      imdbRating: item.vote_average,
    }));

    return { metas };
  } catch (e) {
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  const [mediaType, tmdbId] = id.split('_');
  if (!tmdbId) return null;

  const urlApi = `https://api.themoviedb.org/3/${mediaType === 'series' ? 'tv' : 'movie'}/${tmdbId}?api_key=${API_KEY}&language=pt-BR`;
  try {
    const res = await fetch(urlApi);
    const data = await res.json();

    if (!data) return null;

    let streams = [];
    if (mediaType === 'movie') {
      streams.push({
        title: 'Superflix',
        url: `https://superflixapi.ps/filme/${tmdbId}`,
        externalUrl: true,
      });
    } else if (mediaType === 'series') {
      streams.push({
        title: 'Superflix',
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
      poster: data.poster_path
        ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
        : IMAGEM_PADRAO,
      background: data.backdrop_path
        ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
        : IMAGEM_PADRAO,
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

// Serve manifest.json no /manifest.json
app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

// Serve o addon na rota raiz
app.use('/', (req, res) => {
  addonInterface(req, res);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Addon rodando em http://localhost:${PORT}/manifest.json`);
});
