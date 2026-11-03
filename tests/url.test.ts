import { describe, expect, it } from 'vitest';
import { isWebUrl, isYouTube } from '@/lib/url';

describe('isYouTube', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://youtube.com/shorts/abc',
    'https://m.youtube.com/watch?v=abc',
    'https://music.youtube.com/watch?v=abc',
    'https://youtu.be/abc',
    'https://www.youtube-nocookie.com/embed/abc',
    'HTTPS://WWW.YOUTUBE.COM/watch?v=abc',
  ])('recognises %s', (url) => {
    expect(isYouTube(url)).toBe(true);
  });

  it.each([
    'https://notyoutube.com/watch',
    'https://youtube.com.example.org/watch',
    'https://vimeo.com/1?ref=youtube.com',
    'https://youtube.com@evil.example/',
    'not a url',
  ])('does not treat %s as YouTube', (url) => {
    expect(isYouTube(url)).toBe(false);
  });
});

describe('isWebUrl', () => {
  it('accepts http and https', () => {
    expect(isWebUrl('https://vimeo.com/1')).toBe(true);
    expect(isWebUrl('http://vimeo.com/1')).toBe(true);
  });

  it.each(['chrome://extensions', 'file:///etc/passwd', 'about:blank', 'javascript:alert(1)', ''])(
    'refuses %s',
    (url) => {
      expect(isWebUrl(url)).toBe(false);
    },
  );
});
