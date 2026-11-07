//! Turns what a site calls a video into a short title that reads well as a file name. Facebook puts the
//! view and reaction counts in front of the caption (`1.2K views · 345 reactions | Caption | Page`), and
//! Instagram calls every post `Video by <user>`; neither makes a useful file name.

/// The longest title kept, which is also what the popup's name field holds.
const MAX_TITLE: usize = 100;
/// A caption is cut sooner: it's a sentence or a paragraph, not a name.
const MAX_CAPTION: usize = 60;

/// What a counter counts on social sites. A piece like "1.2K views" is dropped from a title.
const STAT_WORDS: [&str; 14] = [
    "view",
    "views",
    "reaction",
    "reactions",
    "comment",
    "comments",
    "share",
    "shares",
    "like",
    "likes",
    "play",
    "plays",
    "repost",
    "reposts",
];

/// Titles that only say which site or what kind of post it is.
const GENERIC: [&str; 9] = [
    "facebook",
    "instagram",
    "tiktok",
    "video",
    "reel",
    "reels",
    "watch",
    "untitled",
    "post",
];

/// Sites whose name reads better written by hand than taken from the address.
const SITES: [(&str, &str); 10] = [
    ("facebook.com", "Facebook"),
    ("fb.watch", "Facebook"),
    ("instagram.com", "Instagram"),
    ("tiktok.com", "TikTok"),
    ("twitter.com", "X"),
    ("x.com", "X"),
    ("youtube.com", "YouTube"),
    ("youtu.be", "YouTube"),
    ("vimeo.com", "Vimeo"),
    ("dailymotion.com", "Dailymotion"),
];

/// The title to show and to name the file by: the site's title without counters, else the caption's
/// first words, else "<Site> video".
pub fn video_title(
    title: Option<&str>,
    description: Option<&str>,
    uploader: Option<&str>,
    url: &str,
) -> String {
    title
        .and_then(|t| clean_title(t, uploader))
        .or_else(|| description.and_then(caption))
        .unwrap_or_else(|| format!("{} video", site_name(url)))
}

/// `None` when nothing useful is left: only counters, the site's name, or "Video by someone".
pub fn clean_title(title: &str, uploader: Option<&str>) -> Option<String> {
    let mut had_stats = false;
    let mut segments: Vec<String> = Vec::new();
    for segment in title.split('|') {
        let pieces: Vec<&str> = segment.split(['·', '•']).map(str::trim).collect();
        let kept: Vec<&str> = pieces.iter().copied().filter(|p| !is_stat(p)).collect();
        had_stats |= kept.len() < pieces.len();
        let joined = kept
            .into_iter()
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join(" · ");
        if !joined.is_empty() && !is_site_or_kind(&joined) {
            segments.push(joined);
        }
    }
    if had_stats {
        // What's left is "Caption | Page"; the page is already the uploader.
        if segments.len() > 1 {
            if let Some(uploader) = uploader {
                if segments
                    .last()
                    .is_some_and(|s| s.eq_ignore_ascii_case(uploader.trim()))
                {
                    segments.pop();
                }
            }
        }
        segments.truncate(1);
    }
    let text = collapse(&segments.join(" | "));
    if is_generic(&text) {
        return None;
    }
    let max = if had_stats { MAX_CAPTION } else { MAX_TITLE };
    Some(shorten(&without_trailing_tags(&text), max)).filter(|t| !is_generic(t))
}

/// The first line of a caption that has words in it, without links and the hashtags at its end.
pub fn caption(description: &str) -> Option<String> {
    description
        .lines()
        .map(|line| {
            let words: Vec<&str> = line
                .split_whitespace()
                .filter(|w| !w.starts_with("http://") && !w.starts_with("https://"))
                .collect();
            without_trailing_tags(&words.join(" "))
        })
        .find(|line| line.chars().any(char::is_alphanumeric))
        .map(|line| shorten(&line, MAX_CAPTION))
        .filter(|t| !is_generic(t))
}

/// "1.2K views", "345 reactions", "1 comment".
fn is_stat(piece: &str) -> bool {
    let mut words = piece.split_whitespace();
    let (Some(count), Some(word), None) = (words.next(), words.next(), words.next()) else {
        return false;
    };
    let digits = count.trim_end_matches(['K', 'k', 'M', 'm', 'B', 'b']);
    !digits.is_empty()
        && digits.starts_with(|c: char| c.is_ascii_digit())
        && digits
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == ',')
        && STAT_WORDS.contains(&word.to_lowercase().as_str())
}

fn is_site_or_kind(text: &str) -> bool {
    GENERIC.contains(&text.trim().to_lowercase().as_str())
}

/// Empty, a site name, a link, no letters or digits at all, or Instagram's "Video by someone".
fn is_generic(text: &str) -> bool {
    let lower = text.trim().to_lowercase();
    lower.is_empty()
        || is_site_or_kind(&lower)
        || lower.starts_with("http://")
        || lower.starts_with("https://")
        || !lower.chars().any(char::is_alphanumeric)
        || [
            "video by ",
            "reel by ",
            "post by ",
            "photo by ",
            "facebook video by ",
        ]
        .iter()
        .any(|p| lower.starts_with(p) && !lower[p.len()..].trim().contains(' '))
}

fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// "Sunset at the beach #sunset #travel" → "Sunset at the beach". Keeps the tags when that's all there is.
fn without_trailing_tags(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    let keep = words
        .iter()
        .rposition(|w| !w.starts_with('#') && !w.starts_with('@'))
        .map_or(0, |i| i + 1);
    if keep == 0 {
        return words
            .iter()
            .map(|w| w.trim_start_matches(['#', '@']))
            .collect::<Vec<_>>()
            .join(" ");
    }
    words[..keep].join(" ")
}

/// At most `max` characters, cut after a whole word, without punctuation left hanging at the end.
fn shorten(text: &str, max: usize) -> String {
    let text = collapse(text);
    let cut = if text.chars().count() <= max {
        text
    } else {
        let head: String = text.chars().take(max + 1).collect();
        match head.rfind(' ') {
            Some(space) if space > 0 => head[..space].to_string(),
            _ => head.chars().take(max).collect(),
        }
    };
    cut.trim_end_matches(|c: char| c.is_whitespace() || ",;:-–—·|/".contains(c))
        .to_string()
}

/// "Facebook", "Instagram", or the address's own name: "Example" for www.example.co.uk.
pub fn site_name(url: &str) -> String {
    let host = url
        .split("://")
        .nth(1)
        .unwrap_or(url)
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .rsplit('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_lowercase();
    if let Some((_, name)) = SITES
        .iter()
        .find(|(domain, _)| host == *domain || host.ends_with(&format!(".{domain}")))
    {
        return name.to_string();
    }
    let labels: Vec<&str> = host
        .split('.')
        .filter(|l| !l.is_empty() && *l != "www")
        .collect();
    // example.com → example; example.co.uk → example.
    let label = match labels.len() {
        0 => return "Online".to_string(),
        1 => labels[0],
        n if n >= 3 && labels[n - 2].len() <= 3 => labels[n - 3],
        n => labels[n - 2],
    };
    let mut chars = label.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().chain(chars).collect())
        .unwrap_or_else(|| "Online".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_facebook_counters_and_the_page_name() {
        let title = video_title(
            Some("1.2K views · 345 reactions | Morning walk by the river | River Club"),
            None,
            Some("River Club"),
            "https://www.facebook.com/reel/1",
        );
        assert_eq!(title, "Morning walk by the river");
        assert_eq!(
            clean_title("12 comments · 5 shares · 3,456 views | Cake recipe", None).as_deref(),
            Some("Cake recipe")
        );
        assert_eq!(
            clean_title("Goal of the year · 4.5M plays", None).as_deref(),
            Some("Goal of the year")
        );
    }

    #[test]
    fn uses_the_caption_when_the_title_says_nothing() {
        let description = "\n\nSunset at the beach was unreal tonight, we stayed until the very last light faded #sunset #travel\nmore";
        for title in [
            "Video by someone",
            "1K views · 20 reactions",
            "Facebook",
            "",
            "Reel by a.b",
        ] {
            assert_eq!(
                video_title(
                    Some(title),
                    Some(description),
                    None,
                    "https://www.instagram.com/reel/x/"
                ),
                "Sunset at the beach was unreal tonight, we stayed until the"
            );
        }
        assert_eq!(
            caption("https://x.y/z\n#cats #dogs").as_deref(),
            Some("cats dogs")
        );
    }

    #[test]
    fn falls_back_to_the_site() {
        let fallback = |url| video_title(Some("Video by someone"), Some("  \n "), None, url);
        assert_eq!(
            fallback("https://www.facebook.com/watch?v=1"),
            "Facebook video"
        );
        assert_eq!(fallback("https://fb.watch/abc"), "Facebook video");
        assert_eq!(
            fallback("https://www.instagram.com/p/x/"),
            "Instagram video"
        );
        assert_eq!(fallback("https://m.tiktok.com/v/1"), "TikTok video");
        assert_eq!(fallback("https://clips.example.co.uk/v/1"), "Example video");
        assert_eq!(
            fallback("https://user@streams.example.org:8080/v"),
            "Example video"
        );
        assert_eq!(
            video_title(None, None, None, "https://vimeo.com/1"),
            "Vimeo video"
        );
    }

    #[test]
    fn keeps_ordinary_titles() {
        for title in [
            "Top 10 Views of Paris",
            "Song Name | Official Video",
            "1000 Likes Challenge!",
            "Café – Naïve 🎬 [HD]",
        ] {
            assert_eq!(
                clean_title(title, Some("Official Video")).as_deref(),
                Some(title)
            );
        }
    }

    #[test]
    fn shortens_long_titles_after_a_whole_word() {
        let long = "word ".repeat(40);
        let title = clean_title(&long, None).unwrap();
        assert!(title.len() <= MAX_TITLE && title.ends_with("word"));
        assert_eq!(shorten("Ünïcödé ".repeat(20).as_str(), 10), "Ünïcödé");
        assert_eq!(shorten("abc, def:", 50), "abc, def");
    }
}
