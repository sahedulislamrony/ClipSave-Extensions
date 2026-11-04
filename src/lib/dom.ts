/** Small DOM helpers and the icon set, shared by the popup and the Settings page. */

export const ICONS = {
  download: 'M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14',
  close: 'M6.5 6.5l11 11m0-11-11 11',
  retry: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4',
  folder: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h4l2 2.5h7A1.5 1.5 0 0 1 20 10v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z',
  system: 'M4.5 5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 20h6m-3-4v4',
  light: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  dark: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
  playlist: 'M4.5 6.5h15M4.5 11.5h15M4.5 16.5h8m4-1.5v5l4-2.5z',
  video: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h8A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16.5zM15 10.5l5-3v9l-5-3z',
  audio: 'M9 17.5V6.5l10-2v11M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  check: 'M6.5 12.5l3.5 3.5 7.5-8',
  alert: 'M12 9v4.5m0 3v.01M10.3 4.6 3.4 17a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z',
  settings:
    'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.5-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.5-1a7 7 0 0 0 2 1.2L10 21h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.2-.8.2-1.2z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  next: 'M9.5 6l6 6-6 6',
  edit: 'M5 19h3.5L18.2 9.3a2.1 2.1 0 0 0-3-3L5.5 15.9zM13.5 7.8l2.9 2.9',
  back: 'M14.5 6l-6 6 6 6',
  external: 'M14 5h5v5m0-5-8 8M18.5 13.5v4a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 17.5V7a1.5 1.5 0 0 1 1.5-1.5h4',
  bug: 'M9 9.5V8a3 3 0 0 1 6 0v1.5M7 10h10v4.5a5 5 0 0 1-10 0zM12 10v9.5M4 13h3m10 0h3M5 8.5l2 1.5m12-1.5-2 1.5M5 18.5l2.5-1.5m11.5 1.5L16.5 17',
  idea: 'M9.5 18.5h5M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  shield: 'M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6z M9 12l2 2 4-4',
  book: 'M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5zm0 0v14A1.5 1.5 0 0 0 6.5 21H19',
  code: 'M9 7.5 4.5 12 9 16.5M15 7.5l4.5 4.5-4.5 4.5',
  copy: 'M9 9.5A1.5 1.5 0 0 1 10.5 8h8A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5zM15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H9',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.4-5.5M19.5 4.5v4h-4',
  info: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 11v5m0-8v.01',
  palette: 'M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.5-.7 1.5-1.5 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a4.5 4.5 0 0 0 4.5-4.5c0-4-3.8-7.2-8.5-7.2zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01',
};

export type IconName = keyof typeof ICONS;

/** Only for text and attributes: titles and errors come from the web, so nothing here parses HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null));
  return node;
}

export function icon(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}
