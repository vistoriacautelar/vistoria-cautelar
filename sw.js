// ===== SERVICE WORKER — Vistoria Cautelar =====
// Objetivo: permitir que o app ABRA e funcione offline (app shell em cache).
// NÃO cacheia chamadas ao Firebase/Firestore/Storage nem ao Nominatim — essas
// precisam de rede e são tratadas pela própria lógica do app (persistência do
// Firestore + IndexedDB local das fotos). Aqui só garantimos que o HTML/JS/CSS
// e as libs (jsPDF, JSZip, XLSX, qrcode) carreguem sem conexão.

const CACHE_NOME = "vistoria-cautelar-v1";

// App shell: o próprio app + as libs externas usadas (CDN).
// O "./" e "./index.html" cobrem o documento principal (start_url do manifest).
const APP_SHELL = [
  "./",
  "./index.html",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
];

// Domínios que NUNCA devem ser servidos do cache (precisam de rede ao vivo).
// Firebase faz seu próprio controle offline; cachear isso quebraria a sincronização.
const REDE_SEMPRE = [
  "firestore.googleapis.com",
  "firebaseio.com",
  "googleapis.com",
  "gstatic.com",          // SDK do Firebase (módulos ESM)
  "identitytoolkit",      // Firebase Auth
  "securetoken",          // Firebase Auth refresh
  "firebasestorage",
  "nominatim.openstreetmap.org" // geocodificação do GPS
];

// ---- INSTALL: pré-cacheia o app shell ----
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NOME).then(cache =>
      // addAll falha tudo-ou-nada; usamos add individual tolerante a falha de CDN
      Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(err =>
          console.warn("[SW] não consegui cachear:", url, err)
        )
      ))
    ).then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE: limpa caches antigos de versões anteriores ----
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(nomes =>
      Promise.all(
        nomes.filter(n => n !== CACHE_NOME).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH ----
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Só lidamos com GET. POST/PUT (ex.: uploads) passam direto pra rede.
  if (req.method !== "GET") return;

  // 2) Domínios que exigem rede ao vivo: nunca do cache, sempre rede.
  if (REDE_SEMPRE.some(d => url.hostname.includes(d))) {
    return; // deixa o navegador/Firebase cuidarem (com o offline próprio deles)
  }

  // 3) Navegação (abrir o app): network-first com fallback pro index em cache.
  //    Assim, online o usuário pega a versão mais nova; offline, abre do cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_NOME).then(c => c.put("./index.html", copia));
          return resp;
        })
        .catch(() =>
          caches.match("./index.html").then(r => r || caches.match("./"))
        )
    );
    return;
  }

  // 4) Demais assets (libs CDN, ícones): cache-first com atualização em 2º plano.
  event.respondWith(
    caches.match(req).then(cacheado => {
      const naRede = fetch(req)
        .then(resp => {
          if (resp && resp.status === 200) {
            const copia = resp.clone();
            caches.open(CACHE_NOME).then(c => c.put(req, copia));
          }
          return resp;
        })
        .catch(() => cacheado); // offline e sem cache → falha silenciosa
      return cacheado || naRede;
    })
  );
});
