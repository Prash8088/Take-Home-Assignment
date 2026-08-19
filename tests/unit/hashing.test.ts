import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { perceptualHash, similarity } from '../../src/utils/hashing';

describe('perceptual hashing', () => {
  let directory: string;
  beforeAll(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-hash-')); });
  afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  it('matches identical generated images and distinguishes unrelated colours', async () => {
    const black = path.join(directory, 'black.png');
    const white = path.join(directory, 'white.png');
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000000' } }).composite([{ input: { create: { width: 32, height: 64, channels: 3, background: '#ffffff' } }, left: 0, top: 0 }]).png().toFile(black);
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } }).composite([{ input: { create: { width: 32, height: 64, channels: 3, background: '#000000' } }, left: 0, top: 0 }]).png().toFile(white);
    const blackHash = await perceptualHash(black);
    expect(similarity(blackHash, blackHash)).toBe(1);
    expect(similarity(blackHash, await perceptualHash(white))).toBeLessThan(1);
  });
});
