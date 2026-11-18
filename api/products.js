const { put, list, get, del } = require("@vercel/blob");
const { randomUUID } = require("node:crypto");

const categories = new Set([
  "Notebooks", "Computadores", "Componentes", "Periféricos",
  "Monitores", "Redes", "Armazenamento", "Áudio e vídeo", "Outros"
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pathFor = id => `products/${id}.json`;

function validUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalize(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.name || "").trim().slice(0, 120);
  const link = validUrl(value.link);
  if (!name || !link) return null;
  const amount = value.price === null || value.price === "" || value.price === undefined
    ? null : Number(value.price);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return null;
  const image = String(value.image || "");
  if (image.length > 1500000) return null;
  if (image && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image) && !validUrl(image)) return null;
  return {
    id: uuid.test(String(value.id || "")) ? value.id : randomUUID(),
    name, link,
    category: categories.has(value.category) ? value.category : "Outros",
    price: amount,
    description: String(value.description || "").trim().slice(0, 220),
    image,
    createdAt: Number(value.createdAt) || Date.now()
  };
}

async function allProducts() {
  const products = [];
  let cursor;
  do {
    const page = await list({ prefix: "products/", cursor });
    const entries = await Promise.all(page.blobs.map(async blob => {
      const result = await get(blob.pathname, { access: "private" });
      if (result?.statusCode !== 200) return null;
      return JSON.parse(await new Response(result.stream).text());
    }));
    products.push(...entries.filter(Boolean));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return products.sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") return res.status(200).json(await allProducts());
    if (req.method === "POST") {
      const input = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const item = normalize(input);
      if (!item) return res.status(400).json({ error: "Produto inválido" });
      await put(pathFor(item.id), JSON.stringify(item), {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true
      });
      return res.status(200).json(item);
    }
    if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      if (!uuid.test(id)) return res.status(400).json({ error: "ID inválido" });
      await del(pathFor(id));
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Método não permitido" });
  } catch (error) {
    console.error("Products API:", error);
    return res.status(500).json({ error: "Falha no catálogo" });
  }
};
