/** Browser-only helpers. */

export type Photo = { preview: string; base64: string; mediaType: "image/jpeg" };

const TARGET_CHARS = 600_000;

/** Downscale a camera photo to a ≤1024px JPEG so uploads stay fast on job-site signal. */
export async function compressPhoto(file: File, max = 1024): Promise<Photo> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();

  let dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  if (dataUrl.length > TARGET_CHARS) dataUrl = canvas.toDataURL("image/jpeg", 0.55); // very detailed shots
  return { preview: dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}
