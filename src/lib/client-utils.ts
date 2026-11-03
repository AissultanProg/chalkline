/** Browser-only helpers. */

export type Photo = { preview: string; base64: string; mediaType: "image/jpeg" };

/** Downscale a camera photo to a ≤1024px JPEG so uploads stay fast on job-site signal. */
export async function compressPhoto(file: File, max = 1024): Promise<Photo> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return { preview: dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

export const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
