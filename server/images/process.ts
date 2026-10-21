import sharp from 'sharp';
import type { ImageProcessor } from '../contracts.js';
const alphaByte=(alpha: number):number=>255-((alpha<<1)+(alpha>>6));
/** GD stores seven-bit inverted alpha; transparent truecolor PNGs have no
 * transparent palette index, so imagecropauto leaves their geometry intact.
 * A PNG tRNS chunk supplies a transparent color/index and enables tight cropping. */
export const pngProcessor: ImageProcessor = {async process(input) {
  try {
    let image=sharp(input);
    // Inspect PNG chunks rather than treating all RGBA alpha as a GD transparent index.
    let transparentColor=false;
    if(input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      for(let offset=8;offset+12<=input.length;) {
        const length=input.readUInt32BE(offset),type=input.toString('ascii',offset+4,offset+8);
        if(offset+12+length>input.length)break;
        if(type==='tRNS')transparentColor=true;
        offset+=12+length;
      }
    }
    let {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    if(transparentColor) {
      let left=info.width,top=info.height,right=-1,bottom=-1,hasTransparent=false;
      for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
        if(data[(y*info.width+x)*4+3]===0){hasTransparent=true;continue;}
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
      // GD keeps the canvas when every pixel is transparent or no color is fully transparent.
      if(hasTransparent&&right>=left&&bottom>=top) {
        ({data,info}=await sharp(input).extract({left,top,width:right-left+1,height:bottom-top+1}).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
      }
    }
    const width=info.width,height=info.height;
    for(let i=3;i<data.length;i+=4)data[i]=alphaByte(127-(data[i]!>>1));
    let output=data,outWidth=width,outHeight=height;
    if(width>800||height>800) {
      const scale=800/Math.max(width,height);outWidth=Math.trunc(width*scale);outHeight=Math.trunc(height*scale);
      output=Buffer.alloc(outWidth*outHeight*4);
      for(let y=0;y<outHeight;y++)for(let x=0;x<outWidth;x++) {
        const x0=x*width/outWidth,x1=(x+1)*width/outWidth,y0=y*height/outHeight,y1=(y+1)*height/outHeight;
        let red=0,green=0,blue=0,opacity=0,area=0;
        for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++) {
          const weight=(Math.min(x1,sx+1)-Math.max(x0,sx))*(Math.min(y1,sy+1)-Math.max(y0,sy));
          const offset=(sy*width+sx)*4,a=127-(data[offset+3]!>>1),o=(127-a)*weight;
          red+=data[offset]!*o;green+=data[offset+1]!*o;blue+=data[offset+2]!*o;opacity+=o;area+=weight;
        }
        const offset=(y*outWidth+x)*4;
        if(opacity){output[offset]=Math.min(255,Math.floor(red/opacity+0.5));output[offset+1]=Math.min(255,Math.floor(green/opacity+0.5));output[offset+2]=Math.min(255,Math.floor(blue/opacity+0.5));}
        output[offset+3]=alphaByte(Math.max(0,Math.min(127,Math.floor(127-opacity/area+0.5))));
      }
    }
    return await sharp(output,{raw:{width:outWidth,height:outHeight,channels:4}}).png({compressionLevel:6}).toBuffer();
  } catch {return input;}
}};
