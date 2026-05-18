// Service Worker da Vistoria Cautelar
// Estratégia: network-only (sem cache) — garante que toda atualização da página
// seja vista imediatamente, sem o problema clássico de "PWA não atualiza".
// O único motivo de ter SW é habilitar a instalação do app pelo Chrome.

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(clients.claim());
});

self.addEventListener("fetch", e => {
  e.respondWith(
    fetch(e.request).catch(() =>
      new Response("Offline", { status: 503 })
    )
  );
});
