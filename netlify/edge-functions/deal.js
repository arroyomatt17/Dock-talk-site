// Netlify Edge Function: gives each shared deal link (/d/s/ID and /d/r/ID) its own
// link-preview title, text and image. Everyone still gets the normal Dock Talk app.
const SUPABASE_URL = "https://zqosmuwittjelbeggqdy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1FAmfdbXyyYgJjBXoO1RIw_YDIvzGSb"; // public key, same one the app uses

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async (request) => {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/d\/([sr])\/([\w-]+)\/?$/);

  // The app itself (served for every /d/ link)
  const pageRes = await fetch(new URL("/index.html", url));
  let html = await pageRes.text();
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" });
  if (!m) return new Response(html, { status: 200, headers });

  let title = "Dock Talk", desc = "Today's restaurant specials, close to you.";
  let image = `${url.origin}/images/${url.searchParams.get("t") === "d" ? "share-card.png" : "share-card-light.png"}`;
  try {
    const table = m[1] === "s" ? "specials" : "recurring_deals";
    const api = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(m[2])}&select=title,text,photo_url,restaurants(name,photos,status)&limit=1`;
    const r = await fetch(api, { headers: { apikey: SUPABASE_ANON_KEY } });
    const rows = r.ok ? await r.json() : [];
    const d = rows[0];
    if (d && d.restaurants && d.restaurants.status === "approved") {
      const lines = String(d.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
      const head = (d.title && d.title.trim()) || lines[0] || "Today's special";
      title = `${head} at ${d.restaurants.name}`;
      const items = lines.slice(0, 3).map((l) => l.replace(/\s+[-–—]\s+(?=\$?\d|free)/i, " "));
      desc = (d.title && d.title.trim() && items.length ? items.join(" · ") : "See today's deal on Dock Talk") + " · Dock Talk";
      const photo = d.photo_url || (d.restaurants.photos && d.restaurants.photos[0]);
      if (photo) image = photo;
    }
  } catch (_) { /* fall back to the generic preview */ }

  const tags = [
    `<base href="/">`,
    `<meta property="og:site_name" content="Dock Talk">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:url" content="${esc(url.href)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="description" content="${esc(desc)}">`,
  ].join("\n");

  html = html
    .replace(/<meta property="og:[^>]*>\s*/g, "")
    .replace(/<meta name="twitter:[^>]*>\s*/g, "")
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<head>/i, `<head>\n${tags}`);
  return new Response(html, { status: 200, headers });
};

export const config = { path: "/d/*" };
