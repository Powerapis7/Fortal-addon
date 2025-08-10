import { addonBuilder } from 'stremio-addon-sdk';
import fetch from 'node-fetch';

const API_KEY = '12a263eb78c5a66bf238a09bf48a413b'; // sua chave TMDb válida aqui

const IMAGEM_PADRAO = 'https://files.catbox.moe/jwtaje.jpg'; // Exemplo: imagem padrão genérica

const manifest = {
  id: 'org.fortal.play',
  version: '1.0.0',
  name: 'fortal play', // Troque aqui o nome do addon
  description: 'Addon TMDb + streaming fortalplay',
  resources: ['catalog', 'meta'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'tmdb_movies' },
    { type: 'series', id: 'tmdb_series' }
  ],
};

const builder = new addonBuilder(manifest);

// Catalog handler: busca filmes ou séries
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

// Meta handler: detalhes + links de streaming
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
        url: `https://superflixapi.ps/serie/${tmdbId}/1/1`, // temporada 1 episódio 1 fixos
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

export const addon = builder.getInterface();
export const manifestJson = manifest;
