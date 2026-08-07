import { describe, expect, it } from 'vitest';
import {
  ImageLoadError,
  MAX_IMAGE_FILE_BYTES,
  readPlanImage,
} from '@/lib/image';

function fileLike(type: string, size: number): File {
  return { type, size } as File;
}

describe('户型图上传防护', () => {
  it('拒绝非 JPG/PNG MIME', async () => {
    await expect(readPlanImage(fileLike('image/webp', 100))).rejects.toThrow(ImageLoadError);
    await expect(readPlanImage(fileLike('image/webp', 100))).rejects.toThrow('仅支持 JPG 与 PNG');
  });

  it('拒绝空文件', async () => {
    await expect(readPlanImage(fileLike('image/png', 0))).rejects.toThrow('图片文件为空');
  });

  it('在读取为 data URL 前拒绝超过 12 MB 的文件', async () => {
    await expect(readPlanImage(fileLike('image/jpeg', MAX_IMAGE_FILE_BYTES + 1))).rejects.toThrow(
      '不超过 12 MB',
    );
  });
});
