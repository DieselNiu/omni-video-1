import { NextResponse } from 'next/server';
import { HOME_IMAGE_CACHE_CONTROL } from './constants';

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', HOME_IMAGE_CACHE_CONTROL);
  return response;
}
