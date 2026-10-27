// PWA 用の Service Worker。
//  ・Build/ の重いファイル(wasm / data / framework / loader)は「キャッシュ優先」で、2回目からすぐ起動する
//  ・index.html などのページ本体は「ネット優先」(ネットが無い時だけキャッシュ)で、更新がすぐ届く
//  ・同じ場所(オリジン)以外への通信(中継サーバー・GitHubのミッションJSONなど)には触れない
// ビルドの製品バージョン(Player Settings の Version)を上げると、キャッシュ名が変わって古いものは自動で消える。
const cacheName = "2LMCard.com-2LMCard-0.3.2";
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

// リダイレクトを経た応答を、そのまま返すと、iPhone のホーム画面アプリで「ページが開けません」になる。
// 中身だけを写した、リダイレクトのない応答に作り直す。
async function clean(res) {
    if (!res || !res.redirected) return res;
    const body = await res.blob();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

const offlinePage = "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>読み込めません</title></head><body style='margin:0;display:flex;align-items:center;justify-content:center;height:100vh;" +
    "background:#edf1f6;color:#1f2a3d;font-family:sans-serif;text-align:center'><div><p style='font-size:20px'>ゲームを読み込めませんでした。</p>" +
    "<p style='font-size:15px;color:#5e7088'>通信を確認して、もう一度お試しください。</p>" +
    "<button onclick='location.reload()' style='font-size:18px;padding:12px 28px;border:0;border-radius:10px;background:#3b6aa8;color:#fff'>再読み込み</button>" +
    "</div></body></html>";

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
            const key = req.mode === "navigate" ? req.url : req;       // ページの移動は、リダイレクトの扱いが特殊なので、URLで取り直す
            try {
                const res = await clean(await fetch(key));
                if (res && res.ok) (await caches.open(cacheName)).put(key, res.clone()).catch(function () { });
                return res;
            } catch (err) {
                const hit = await caches.match(key, { ignoreSearch: true }) || await caches.match("index.html") || await caches.match("./");
                if (hit) return clean(hit);
                // どちらも無い(圏外で初めて開いた等): ブラウザの「ページが開けません」ではなく、やさしい案内を出す
                return new Response(offlinePage, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
            }
        })());
        return;
    }

    // キャッシュ優先
    e.respondWith((async function () {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // 容量の上限(特にiPhone)で保存できなくても、ゲームは動かす
        if (res && res.ok && res.status === 200) (await caches.open(cacheName)).put(req, res.clone()).catch(function () { });
        return res;
    })());
});
