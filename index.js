import pkg from "stremio-addon-sdk";
const { addonBuilder, serveHTTP } = pkg;
import fetch from "node-fetch";

// ... resto do código continua igual

const API_URL = "https://superflixapi.digital";

const manifest = {
  id: "br.superflix",
  version: "1.0.0",
  name: "SuperFlix",
  description: "Addon para filmes, séries, animes e doramas",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series", "anime", "serie"],
  catalogs: [
    { type: "movie", id: "superflix_movies", name: "Filmes" },
    { type: "series", id: "superflix_series", name: "Séries" },
    { type: "anime", id: "superflix_animes", name: "Animes" },
    { type: "serie", id: "superflix_doramas", name: "Doramas" }
  ],
};

const builder = new addonBuilder(manifest);

// Busca lista dos conteúdos (filme, serie, anime, dorama)
async function fetchContent(category) {
  try {
    const res = await fetch(`${API_URL}/lista?category=${category}&format=json`);
    const data = await res.json();
    return data.map(item => ({
      id: item.id.toString(),
      type: category === "serie" ? "series" : category,
      name: item.title || item.name || item.original_title || "Sem nome",
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
      background: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : "",
      description: item.overview || "Sem descrição disponível.",
    }));
  } catch (error) {
    console.error("Erro fetchContent:", error);
    return [];
  }
}

// Busca metadados detalhados pelo id
async function fetchMeta(id, type) {
  try {
    const res = await fetch(`${API_URL}/${type}/${id}`);
    const data = await res.json();
    return {
      id: data.id.toString(),
      type: type === "serie" ? "series" : type,
      name: data.title || data.name || data.original_title || "Sem nome",
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : "",
      background: data.backdrop_path ? `https://image.tmdb.org/t/p/w500${data.backdrop_path}` : "",
      description: data.overview || "Sem descrição disponível.",
      genres: data.genres ? data.genres.map(g => g.name) : [],
      year: data.release_date ? data.release_date.slice(0,4) : data.first_air_date ? data.first_air_date.slice(0,4) : "N/A",
    };
  } catch (error) {
    console.error("Erro fetchMeta:", error);
    return null;
  }
}

// Busca streams para reprodução
async function fetchStreams(id) {
  try {
    const res = await fetch(`${API_URL}/stape/${id}`);
    const data = await res.json();
    if(!data.stream_url) return [];
    return [{
      title: data.title || "Stream",
      url: data.stream_url,
      isM3U8: true,
    }];
  } catch (error) {
    console.error("Erro fetchStreams:", error);
    return [];
  }
}

// Handlers

builder.defineCatalogHandler(async ({ type, search }) => {
  if (search) {
    // Busca por termo usando /busca endpoint
    try {
      const res = await fetch(`${API_URL}/busca?search=${encodeURIComponent(search)}&format=json`);
      const data = await res.json();
      const metas = data.map(item => ({
        id: item.id.toString(),
        type: item.type === "serie" ? "series" : item.type,
        name: item.title || item.name || "Sem nome",
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        description: item.overview || "Sem descrição",
      }));
      return { metas };
    } catch {
      return { metas: [] };
    }
  } else {
    let category;
    switch (type) {
      case "movie": category = "movie"; break;
      case "series": category = "serie"; break;
      case "anime": category = "anime"; break;
      case "serie": category = "serie"; break; // doramas também usam 'serie' na API
      default: return { metas: [] };
    }
    const metas = await fetchContent(category);
    return { metas };
  }
});

builder.defineMetaHandler(async ({ id, type }) => {
  const meta = await fetchMeta(id, type === "series" ? "serie" : type);
  if (!meta) return { meta: null };
  return { meta };
});

builder.defineStreamHandler(async ({ id }) => {
  const streams = await fetchStreams(id);
  return { streams };
});

// Start server na porta 7000
serveHTTP(builder.getInterface(), { port: 7000 });
console.log("Addon SuperFlix rodando em http://localhost:7000/manifest.json");