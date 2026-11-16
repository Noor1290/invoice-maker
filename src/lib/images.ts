/**
 * Convert any browser-decodable image (PNG, JPG, WebP, SVG) into a PNG Blob,
 * scaled down to at most `maxWidth`. PDFs can only embed PNG/JPG, so logos are
 * normalised once at upload time.
 */
export async function imageFileToPng(file: Blob, maxWidth = 1200): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This file could not be read as an image.'));
      el.src = url;
    });
    const w0 = img.naturalWidth || 600;
    const h0 = img.naturalHeight || 200;
    const scale = Math.min(1, maxWidth / w0);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w0 * scale);
    canvas.height = Math.round(h0 * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert image.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
