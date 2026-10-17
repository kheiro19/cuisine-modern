# ambientCG والوسيط (proxy)

موقع ambientCG لا يرسل ترويسات CORS، فلا يستطيع متصفحك قراءة واجهته (`/api/v2/full_json`) ولا ملفاته مباشرة. يظهر ذلك في
Firefox بعبارة «NetworkError when attempting to fetch resource». الحل أن يمرّ الطلب عبر **وسيط من نفس موقعك**.

## أثناء التطوير (لا يلزمك شيء)
`vite.config.ts` يحوي الوسيط. شغّل `npm run dev` (أو `npm run preview`) **وأعد تشغيله بعد كل تحديث** لأن إعدادات Vite لا تُقرأ إلا عند البدء.
المساران: `/proxy/ambientcg/*` إلى `https://ambientcg.com`، و`/proxy/acgmedia/*` إلى `https://f003.backblazeb2.com` (صور اللون).

## على استضافة ثابتة (بعد `npm run build`)
Vite لا يعمل هناك، فانشر وسيطًا صغيرًا يقدّم المسارين نفسيهما، واضبط في بيئة البناء:

    VITE_AMBIENTCG_PROXY=https://اسم-الوسيط.workers.dev

مثال Cloudflare Worker (غير مُجرَّب هنا):

```js
const ROUTES = [['/proxy/acgmedia', 'https://f003.backblazeb2.com'], ['/proxy/ambientcg', 'https://ambientcg.com']];
export default {
  async fetch(req) {
    const u = new URL(req.url);
    for (const [prefix, target] of ROUTES) {
      if (!u.pathname.startsWith(prefix)) continue;
      const r = await fetch(target + u.pathname.slice(prefix.length) + u.search, { redirect: 'follow' });
      const h = new Headers(r.headers);
      h.set('Access-Control-Allow-Origin', '*');
      return new Response(r.body, { status: r.status, headers: h });
    }
    return new Response('not found', { status: 404 });
  },
};
```

## Poly Haven
لا يحتاج وسيطًا: واجهته تسمح بالقراءة من أي موقع، وقد ظهرت قائمته عندك.
