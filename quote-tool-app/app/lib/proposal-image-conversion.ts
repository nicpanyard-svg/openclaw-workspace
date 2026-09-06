// PDF image embedding accepts PNG/JPEG. Decode other supported image formats
// locally and preserve their native dimensions and transparency in a PNG.
export async function convertProposalImageToPng(blob: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function") throw new Error("image conversion is unavailable in this browser; try a current browser or attach a PNG");
  const bitmap = await createImageBitmap(blob);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("Image has no pixels");
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image canvas is unavailable");
      context.drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: "image/png" });
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image canvas is unavailable");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (png) => png ? resolve(png) : reject(new Error("PNG encoding failed")), "image/png",
    ));
  } finally {
    bitmap.close();
  }
}
