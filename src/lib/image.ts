import type { PlanImage } from './types';

export const MAX_IMAGE_EDGE = 1600;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

export class ImageLoadError extends Error {}

/**
 * 读取用户上传的户型图，等比缩放到合理尺寸后转成 dataURL。
 * 缩放可以显著降低 localStorage 占用（一般控制在 1MB 以内）。
 */
export async function readPlanImage(file: File): Promise<PlanImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageLoadError('仅支持 JPG 与 PNG 格式的户型图。');
  }
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  if (scale === 1 && file.type === 'image/jpeg') {
    return { dataUrl, width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageLoadError('当前浏览器不支持 Canvas，无法处理图片。');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), width, height };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageLoadError('读取文件失败，请重试。'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageLoadError('图片解析失败，请更换文件。'));
    image.src = src;
  });
}
