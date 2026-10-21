import { phpString, phpTrim } from '../http/query.js';
export const scientificName = (value: unknown): string => phpTrim(phpString(value));
export const validName = (value: string): boolean => /^[A-Za-z]{2,40}(?: [a-z]{2,40}){1,3}$/.test(value);
export function allowedPhoto(value: unknown): boolean {
  try { return /(?:^|\.)(?:wikimedia\.org|wikipedia\.org)$/i.test(new URL(phpString(value)).hostname); } catch { return false; }
}
export function summaryUrl(sci: string): string { return 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(sci); }
