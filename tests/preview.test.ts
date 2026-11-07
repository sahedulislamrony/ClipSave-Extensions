import { describe, expect, it } from 'vitest';
import { instantPreview, oEmbedEndpoint, pageTitle, youtubeVideoId } from '@/lib/preview';

describe('youtubeVideoId', () => {
  it('reads every kind of YouTube link', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1',
      'https://youtu.be/dQw4w9WgXcQ?t=3',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(youtubeVideoId(url)).toBe('dQw4w9WgXcQ');
    }
  });

  it('ignores playlists, other sites and broken IDs', () => {
    expect(youtubeVideoId('https://www.youtube.com/playlist?list=PL1')).toBeNull();
    expect(youtubeVideoId('https://vimeo.com/76979871')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(youtubeVideoId('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeVideoId('not a link')).toBeNull();
  });
});

describe('pageTitle', () => {
  it("drops the site's name and unread counts", () => {
    expect(pageTitle('(3) How to bake bread - YouTube')).toBe('How to bake bread');
    expect(pageTitle('Clip | TikTok')).toBe('Clip');
  });

  it('says nothing when only the site is left', () => {
    expect(pageTitle('(20+) Facebook')).toBeNull();
    expect(pageTitle('Instagram')).toBeNull();
    expect(pageTitle('')).toBeNull();
    expect(pageTitle(undefined)).toBeNull();
  });
});

describe('instantPreview', () => {
  it("shows a YouTube video's picture and the tab's title before any request", () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(instantPreview(url, { url, title: 'Song - YouTube' })).toEqual({
      title: 'Song',
      uploader: null,
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    });
  });

  it("uses the tab's title only for the tab's own page", () => {
    const preview = instantPreview('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { url: 'https://other.example/', title: 'Other' });
    expect(preview?.title).toBeNull();
    expect(instantPreview('https://www.facebook.com/reel/1', { url: 'https://www.facebook.com/reel/1', title: 'Facebook' })).toBeNull();
  });
});

describe('oEmbedEndpoint', () => {
  it('asks only sites that let an extension read the answer', () => {
    expect(oEmbedEndpoint('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ',
    );
    expect(oEmbedEndpoint('https://vimeo.com/1')).toMatch(/^https:\/\/vimeo\.com\/api\/oembed\.json\?url=/);
    expect(oEmbedEndpoint('https://www.tiktok.com/@a/video/1')).toMatch(/^https:\/\/www\.tiktok\.com\/oembed\?url=/);
    expect(oEmbedEndpoint('https://www.facebook.com/reel/1')).toBeNull();
    expect(oEmbedEndpoint('https://www.instagram.com/p/x/')).toBeNull();
  });
});
