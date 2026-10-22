import { Router } from 'express';
import type { Dependencies } from '../contracts.js';
export function createMenuRouter(_deps: Dependencies): Router {
  const router=Router();
  router.all('/',(_req,res)=>{res.set('Cache-Control','no-store').json({items:[]});});
  return router;
}
