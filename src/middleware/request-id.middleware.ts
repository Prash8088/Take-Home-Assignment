import { randomUUID } from 'crypto'; import { Request, Response, NextFunction } from 'express';
export function requestId(req:Request,res:Response,next:NextFunction):void { req.id=req.header('x-request-id') ?? `req_${randomUUID()}`; res.setHeader('x-request-id',req.id); next(); }
