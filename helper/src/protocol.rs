//! Native messaging: JSON messages, each after a 32-bit length in native byte order.
//! The message shapes mirror `src/lib/types.ts`. Keep the two in sync.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::sync::{Arc, Mutex};

/// The browser accepts at most 1 MB per message from a host.
const MAX_OUTGOING: usize = 1024 * 1024;
const MAX_INCOMING: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Request {
    Hello {
        id: String,
    },
    Inspect {
        id: String,
        url: String,
    },
    Download {
        id: String,
        url: String,
        quality: Quality,
    },
    Cancel {
        id: String,
    },
    Reveal {
        id: String,
        path: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Quality {
    Best,
    Video { height: u32 },
    Audio { format: AudioFormat },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    M4a,
}

impl AudioFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            AudioFormat::Mp3 => "mp3",
            AudioFormat::M4a => "m4a",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatOption {
    pub key: String,
    pub label: String,
    pub size_bytes: Option<u64>,
    pub quality: Quality,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub url: String,
    pub title: String,
    pub uploader: Option<String>,
    pub thumbnail: Option<String>,
    pub duration_sec: Option<u64>,
    pub options: Vec<FormatOption>,
}

/// Reads one message. `Ok(None)` means the browser closed the pipe.
pub fn read_message(input: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut length = [0u8; 4];
    match input.read_exact(&mut length) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let length = u32::from_ne_bytes(length) as usize;
    if length > MAX_INCOMING {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "message too large",
        ));
    }
    let mut body = vec![0u8; length];
    input.read_exact(&mut body)?;
    Ok(Some(body))
}

pub fn write_message(output: &mut impl Write, message: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(message)?;
    if body.len() > MAX_OUTGOING {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "message too large",
        ));
    }
    output.write_all(&(body.len() as u32).to_ne_bytes())?;
    output.write_all(&body)?;
    output.flush()
}

/// Shared by every job thread, so one message is never written into the middle of another.
#[derive(Clone)]
pub struct Outbox(Arc<Mutex<io::Stdout>>);

impl Outbox {
    pub fn new() -> Self {
        Outbox(Arc::new(Mutex::new(io::stdout())))
    }

    pub fn send(&self, message: Value) {
        let mut stdout = self.0.lock().unwrap();
        // A failed write means the browser left; the read loop sees that and shuts down.
        let _ = write_message(&mut *stdout, &message);
    }

    pub fn error(&self, id: &str, message: &str) {
        self.send(json!({ "id": id, "type": "error", "message": message }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn round_trips_a_message() {
        let mut buffer = Vec::new();
        write_message(&mut buffer, &json!({ "type": "hello" })).unwrap();
        let body = read_message(&mut Cursor::new(buffer)).unwrap().unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({ "type": "hello" })
        );
    }

    #[test]
    fn a_closed_pipe_is_not_an_error() {
        assert!(read_message(&mut Cursor::new(Vec::new()))
            .unwrap()
            .is_none());
    }

    #[test]
    fn refuses_an_oversized_incoming_message() {
        let huge = ((MAX_INCOMING + 1) as u32).to_ne_bytes().to_vec();
        assert!(read_message(&mut Cursor::new(huge)).is_err());
    }

    #[test]
    fn refuses_an_oversized_outgoing_message() {
        let huge = json!({ "text": "x".repeat(MAX_OUTGOING) });
        assert!(write_message(&mut Vec::new(), &huge).is_err());
    }

    #[test]
    fn parses_requests_from_the_extension() {
        let request: Request = serde_json::from_value(json!({
            "id": "a", "type": "download", "url": "https://vimeo.com/1",
            "quality": { "kind": "audio", "format": "mp3" },
        }))
        .unwrap();
        match request {
            Request::Download { quality, .. } => {
                assert_eq!(
                    quality,
                    Quality::Audio {
                        format: AudioFormat::Mp3
                    }
                )
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
