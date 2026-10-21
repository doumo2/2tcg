// PWA 用の Service Worker。
//  ・Build/ の重いファイル(wasm / data / framework / loader)は「キャッシュ優先」で、2回目からすぐ起動する
//  ・index.html などのページ本体は「ネット優先」(ネットが無い時だけキャッシュ)で、更新がすぐ届く
//  ・同じ場所(オリジン)以外への通信(中継サーバー・GitHubのミッションJSONなど)には触れない
// ビルドの製品バージョン(Player Settings の Version)を上げると、キャッシュ名が変わって古いものは自動で消える。
const cacheName = "2LMCard.com-2LMCard-0.1.5";
const buildFiles = [
    "Build/Unity WebGL.loader.js",
    "Build/Unity WebGL.framework.js",
    "Build/Unity WebGL.wasm",
    "Build/Unity WebGL.data",
];
const shellFiles = [
    "./",
    "index.html",
    "manifest.webmanifest",
    "TemplateData/style.css",
    "TemplateData/favicon.ico",
    "TemplateData/icons/icon-180.png",
    "TemplateData/icons/icon-192.png",
    "TemplateData/icons/icon-512.png"
];

self.addEventListener("install", function (e) {
    e.waitUntil((async function () {
        const cache = await caches.open(cacheName);
        // 1つ失敗しても全体は止めない
        await Promise.all(shellFiles.concat(buildFiles).map(function (url) {
            return cache.add(url).catch(function (err) { console.warn("[SW] cache skip", url, err); });
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", function (e) {
    e.waitUntil((async function () {
        const keys = await caches.keys();
        await Promise.all(keys.filter(function (k) { return k !== cacheName; }).map(function (k) { return caches.delete(k); }));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", function (e) {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;       // 外部への通信は触らない

    const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html") || url.pathname.endsWith(".webmanifest");

    if (isPage) {
        // ネット優先
        e.respondWith((async function () {
            try {
                const res = await fetch(req);
                if (res && res.ok) (await caches.open(cacheName)).put(req, res.clone());
                return res;
            } catch (err) {
                const hit = await caches.match(req, { ignoreSearch: true }) || await caches.match("index.html");
                if (hit) return hit;
                throw err;
            }
        })());
        return;
    }

    // キャッシュ優先
    e.respondWith((async function () {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok && res.status === 200) (await caches.open(cacheName)).put(req, res.clone());
        return res;
    })());
});
