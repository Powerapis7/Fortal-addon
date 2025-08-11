// Importações
import sdk from 'stremio-addon-sdk';
import fetch from 'node-fetch';
import cheerio from 'cheerio'; // Biblioteca para analisar HTML

const { addonBuilder, serveHTTP } = sdk;

// --- CONFIGURAÇÃO ---
const API_KEY = '12a263eb78c5a66bf238a09bf48a413b';
const PORT = process.env.PORT || 7000;

// --- MANIFEST ---
const manifest = {
  id: 'org.fortal.play.superflix.completo',
  version: '16.0.0', // Versão com suporte a múltiplos áudios
  name: 'Fortal Play (Superflix)',
  description: 'Addon que busca todas as fontes (Dublado/Legendado) da Superflix.',
  logo: 'https://files.catbox.moe/jwtaje.jpg',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'tmdb:']
};

// --- LÓGICA DO ADDON ---
const builder = new addonBuilder(manifest);

// HANDLER DE STREAMS - A VERSÃO COMPLETA
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[LOG] Stream: Iniciando processo para ID "${id}".`);
  
  let imdbId = id;

  // 1. GARANTIR QUE TEMOS O IMDb ID
  if (id.startsWith('tmdb:')) {
    const tmdbId = id.split(':')[1];
    const findUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${API_KEY}`;
    try {
      const res = await fetch(findUrl);
      const externalIds = await res.json();
      imdbId = externalIds.imdb_id;
    } catch(e) { return Promise.resolve({ streams: [] }); }
  }

  if (!imdbId || !imdbId.startsWith('tt')) {
    return Promise.resolve({ streams: [] });
  }

  try {
    // 2. PASSO 1: ACESSAR A PÁGINA HTML
    const superflixType = type === 'movie' ? 'filme' : 'serie';
    const pageUrl = `https://superflixapi.digital/${superflixType}/${imdbId}`;
    console.log(`[LOG] Passo 1: Acessando página HTML em ${pageUrl}`);
    
    const pageResponse = await fetch(pageUrl);
    const html = await pageResponse.text();

    // 3. PASSO 2: ANALISAR O HTML E ENCONTRAR TODOS OS SERVIDORES
    const $ = cheerio.load(html);
    const serverElements = $('.player_select_item'); // Pega TODOS os elementos com a classe

    if (serverElements.length === 0) {
      console.log(`[AVISO] Nenhum servidor encontrado na página.`);
      return Promise.resolve({ streams: [] });
    }
    console.log(`[LOG] Passo 2: Encontrados ${serverElements.length} servidores na página.`);

    const allStreams = [];

    // 4. PASSO 3: FAZER UM LOOP POR CADA SERVIDOR ENCONTRADO
    for (const element of serverElements) {
      const serverId = $(element).data('id');
      const serverName = $(element).find('.player_select_name').text().trim();
      
      // No seu HTML, o legendado tem o data-id 'fake-legendado'. Vamos tratar isso.
      if (serverId === 'fake-legendado') {
          // A URL para o player legendado é diferente, como vimos no HTML
          const legendadoUrl = `https://superflixapi.digital/fIlme/${imdbId}`;
          allStreams.push({
              title: `Fortal Play (Legendado Beta)`,
              url: legendadoUrl,
              behaviorHints: { notWebReady: true, isFrame: true } // Dica de que é um iframe
          });
          console.log(`[LOG] Adicionado link especial para o servidor Legendado Beta.`);
          continue; // Pula para o próximo servidor no loop
      }

      if (!serverId) continue; // Pula se não encontrar um ID

      console.log(`[LOG] Passo 3: Processando servidor "${serverName}" com video_id '${serverId}'`);

      // 5. PASSO 4: FAZER A CHAMADA 'POST' PARA A API
      const apiUrl = 'https://superflixapi.digital/api';
      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=getPlayer&video_id=${serverId}`
      });

      const data = await apiResponse.json();

      if (data.success && data.data?.video_url) {
        const finalVideoUrl = data.data.video_url;
        console.log(`[LOG] SUCESSO! Link obtido para "${serverName}": ${finalVideoUrl}`);
        
        // Adiciona o link encontrado à nossa lista de streams
        allStreams.push({
          title: `Fortal Play (${serverName})`,
          url: finalVideoUrl,
          behaviorHints: { notWebReady: true }
        });
      } else {
        console.log(`[AVISO] Falha ao obter link para o servidor "${serverName}".`);
      }
    }

    if (allStreams.length === 0) {
        console.log(`[AVISO] Final: Nenhum link de vídeo válido foi obtido após processar todos os servidores.`);
        return Promise.resolve({ streams: [] });
    }

    console.log(`[LOG] Final: Retornando um total de ${allStreams.length} links para o Stremio.`);
    return Promise.resolve({ streams: allStreams });

  } catch (error) {
    console.error('[ERRO] Falha crítica no processo da Superflix.', error);
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
