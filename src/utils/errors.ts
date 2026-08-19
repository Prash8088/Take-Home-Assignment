import { Request, Response, NextFunction } from 'express';
export class AppError extends Error { constructor(public status:number, public code:string, message:string) { super(message); } }
export function errorHandler(error:unknown, req:Request, res:Response, _next:NextFunction):void { const e=error instanceof AppError ? error : new AppError(500,'INTERNAL_ERROR','An unexpected error occurred.'); req.log.error({err:error,requestId:req.id},'request failed'); res.status(e.status).json({error:{code:e.code,message:e.message},requestId:req.id}); }
