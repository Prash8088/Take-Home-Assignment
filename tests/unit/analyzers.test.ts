import { brightness, normalizeOcrText, vehicle } from '../../src/analyzers/image.analyzers';
describe('vehicle format',()=>{it('accepts a conventional Indian registration format',()=>expect(vehicle('KA01AB1234',.8).formatValid).toBe(true));it('rejects arbitrary OCR text',()=>expect(vehicle('HELLOWORLD',.8).formatValid).toBe(false));});
describe('brightness',()=>{const stats={channels:[{mean:10,stdev:1},{mean:10,stdev:1},{mean:10,stdev:1}]} as never;it('flags very dark image',()=>expect(brightness(stats).status).toBe('very_dark'));});
describe('OCR normalization',()=>{it('removes formatting while retaining vehicle characters',()=>expect(normalizeOcrText('KA 01-ab 1234')).toBe('KA01AB1234'));});
