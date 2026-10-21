export type QueryValue = string | QueryValue[] | {[key: string]: QueryValue};
export type LegacyQuery = Record<string, QueryValue>;
/** PHP scalar repeats overwrite; bracket entries accumulate and indexed entries overwrite. */
const order = new WeakMap<object, string[]>();
export function phpValues(value: QueryValue[] | {[key: string]: QueryValue}): QueryValue[] {
  return (order.get(value) ?? Object.keys(value)).filter(key => Object.hasOwn(value,key)).map(key => (value as Record<string,QueryValue>)[key]!);
}
export function parseQuery(raw: string): LegacyQuery {
  const out: LegacyQuery = {};
  for(const [key,value] of new URLSearchParams(raw)) {
    const match=/^([^[]+)\[([^\]]*)\]/.exec(key);
    if(!match) {out[key.replace(/[ .]/g,'_')]=value; continue;}
    const base=match[1]!.replace(/[ .]/g,'_'), index=match[2]!;
    let entries=out[base];
    if(!entries || typeof entries === 'string') {entries={};order.set(entries,[]);}
    const keys=order.get(entries)!;
    const numeric=keys.filter(k=>/^(0|[1-9]\d*)$/.test(k)).map(Number);
    const resolved=index === '' ? String(numeric.length ? Math.max(...numeric)+1 : 0) : index;
    if(!Object.hasOwn(entries,resolved))keys.push(resolved);
    (entries as Record<string,QueryValue>)[resolved]=value;
    out[base]=entries;
  }
  // PHP JSON encodes only zero-based insertion-ordered arrays as lists.
  for(const [key,value] of Object.entries(out)) {
    if(typeof value === 'object') {
      const keys=order.get(value) ?? Object.keys(value);
      if(keys.every((entry,index)=>entry===String(index))) {
        const array=keys.map(entry=>(value as Record<string,QueryValue>)[entry]!);
        order.set(array,keys);out[key]=array;
      }
    }
  }
  return out;
}
export function phpString(value: unknown): string { if(value == null || value === false) return ''; if(value === true)return '1'; if(typeof value==='object')return 'Array';return String(value); }
export function phpInt(value: unknown): number {if(value && typeof value==='object')return Object.keys(value).length?1:0;const match=/^[\s]*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(phpString(value));return match?Math.trunc(Number(match[0])):0;}
export function phpNumeric(value: unknown): boolean {return typeof value==='number' || (typeof value==='string' && value.trim()!=='' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()));}
export function phpTruthy(value: unknown): boolean {return !(value == null || value===false || value===0 || value==='' || value==='0' || (typeof value==='object' && Object.keys(value).length===0));}
/** PHP trim() default charlist; deliberately excludes Unicode whitespace. */
export function phpTrim(value: string): string {return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g,'');}
