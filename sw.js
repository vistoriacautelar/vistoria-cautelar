// ============================================================================
// Vistoria Cautelar - Service Worker
// ============================================================================
// Estratégia: NETWORK-FIRST com fallback para cache (uso offline)
//
// Por que network-first?
// - O app é uma página única (index.html) que muda com frequência durante o
//   desenvolvimento. Cache-first travaria o usuário em versões antigas.
// - Em modo online: sempre busca a versão fresca do servidor. Atualizações
//   aparecem imediatamente sem precisar limpar cache manualmente.
// - Em modo offline: serve a última versão que conseguiu baixar (do cache).
//
// VERSIONAMENTO: incremente CACHE_VERSION sempre que houver mudanças relevantes
// no index.html. Isso força todos os clientes a descartarem o cache antigo
// no próximo carregamento.
// ============================================================================

const CACHE_VERSION = "v20260701-1";
const CACHE_NAME = "vistoria-cautelar-" + CACHE_VERSION;

// Arquivos do app shell que serão cacheados na instalação.
// Em network-first eles servem como fallback offline.
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json"
];

// === INSTALAÇÃO ===
// Baixa o shell e ativa imediatamente (skipWaiting) — não espera abas antigas.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch((err) => console.warn("[SW] Cache install falhou:", err))
      .then(() => self.skipWaiting())
  );
});

// === ATIVAÇÃO ===
// Apaga caches antigos (de versões anteriores) e assume controle de todas as abas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("vistoria-cautelar-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// === FETCH ===
// NETWORK-FIRST: tenta rede primeiro, cache só como fallback.
// Ignora requisições não-GET, requisições do Firebase/Firestore (deixa o SDK
// tratar) e requisições cross-origin de mapas/CDN (deixa o navegador cuidar).
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só intercepta GETs do MESMO domínio (PWA do app)
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Ignora chamadas a APIs externas que o app faz (Firebase, mapas, etc.)
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("nominatim.openstreetmap.org") ||
    url.hostname.includes("arcgisonline.com") ||
    url.hostname.includes("cdnjs.cloudflare.com")
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Sucesso na rede: atualiza o cache em background e retorna a resposta
        if (response && response.ok) {
          const cloned = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(req, cloned))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => {
        // Falha na rede: serve do cache se houver
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          // Se for navegação (HTML), fallback para index cacheado
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("Offline e sem cache disponível", {
            status: 503,
            statusText: "Offline",
          });
        });
      })
  );
});

// === MENSAGEM: forçar atualização imediata vinda do app ===
// O app pode enviar `{type: "SKIP_WAITING"}` pra forçar ativação do novo SW.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
