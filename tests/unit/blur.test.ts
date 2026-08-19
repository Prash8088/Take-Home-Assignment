import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { laplacianBlur } from '../../src/analyzers/image.analyzers';

describe('Laplacian blur analysis', () => {
  let directory: string;
  beforeAll(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-blur-')); });
  afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  it('flags a flat image and accepts an edge-rich generated image', async () => {
    const flat = path.join(directory, 'flat.png');
    const edgeRich = path.join(directory, 'edge-rich.png');
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#808080' } }).png().toFile(flat);
    const raw = Buffer.alloc(400 * 300 * 3);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) {
      const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 0 : 255;
      raw[(y * 400 + x) * 3] = value; raw[(y * 400 + x) * 3 + 1] = value; raw[(y * 400 + x) * 3 + 2] = value;
    }
    await sharp(raw, { raw: { width: 400, height: 300, channels: 3 } }).png().toFile(edgeRich);
    expect((await laplacianBlur(flat)).status).toBe('suspicious');
    expect((await laplacianBlur(edgeRich)).status).toBe('pass');
  });
});
