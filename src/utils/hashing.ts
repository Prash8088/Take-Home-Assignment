import { createHash } from 'crypto'; import { promises as fs } from 'fs'; import sharp from 'sharp';
export async function fileHash(path:string):Promise<string>{ return createHash('sha256').update(await fs.readFile(path)).digest('hex'); }
export async function perceptualHash(path:string):Promise<string>{ const {data,info}=await sharp(path).resize(8,8,{fit:'fill'}).grayscale().raw().toBuffer({resolveWithObject:true}); const avg=data.reduce((a,b)=>a+b,0)/data.length; return [...data].map(v=>v>=avg?'1':'0').join(''); }
export function similarity(a:string,b:string):number { if(a.length!==b.length) return 0; let d=0; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) d++; return 1-d/a.length; }
