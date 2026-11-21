import { logoShapes } from './logoShapes';

/** A standalone SVG favicon: the mark on transparency, the same on light and dark browser tabs. */
export function logoFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${logoShapes()}</svg>`;
}
