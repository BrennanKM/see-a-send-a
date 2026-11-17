// Shrink photos on the phone before upload: faster posts, less storage.

async function load(file) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

const toBlob = (canvas, q) => new Promise((res, rej) =>
  canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", q));

export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const img = await load(file);
  const w = img.width, h = img.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return toBlob(c, quality);
}

export async function squareAvatar(file, size = 400) {
  const img = await load(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return toBlob(c, 0.85);
}
