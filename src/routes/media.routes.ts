import { Router } from 'express'; import { upload } from '../middleware/upload.middleware'; import { uploadMedia,status,result } from '../controllers/media.controller';
export const mediaRouter=Router(); mediaRouter.post('/',upload.single('file'),uploadMedia); mediaRouter.get('/:processingId/status',status); mediaRouter.get('/:processingId/result',result);
