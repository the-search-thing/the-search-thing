//! Framed bincode IPC for Rust-native clients (e.g. GPUI).
//!
//! Enable by spawning the sidecar with **`THE_SEARCH_THING_IPC_MODE=native`**. Default remains
//! JSON-RPC NDJSON on stdio for Electron.
//!
//! Wire format per message: **`u32` little-endian byte length**, then **`bincode`** payload
//! (`bincode` crate, default serde encoding).
//!
//! Request and response are [`NativeRequest`] and [`NativeResponse`].

use std::io::{self, ErrorKind, Read, Write};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::sidecar::rpc::fs::{walk_text_batch, WalkTextBatchParams, WalkTextBatchResult};
use crate::sidecar::rpc::search::search_query_value;

const MAX_FRAME_BYTES: usize = 256 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum FramingError {
    #[error("io: {0}")]
    Io(#[from] io::Error),
    #[error("frame length {len} exceeds maximum {MAX_FRAME_BYTES}")]
    FrameTooLarge { len: usize },
    #[error("bincode: {0}")]
    Bincode(#[from] bincode::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NativeRequest {
    Ping,
    SearchQuery { query: String },
    WalkTextBatch(WalkTextBatchParams),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NativeSearchRow {
    pub label: String,
    pub path: String,
    #[serde(default)]
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NativeSearchQueryBody {
    pub query: String,
    pub results: Vec<NativeSearchRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NativeResponse {
    PingResult {
        ok: bool,
        service: String,
        version: String,
        index_mode: String,
        search_mode: String,
    },
    SearchQueryResult(NativeSearchQueryBody),
    WalkTextBatchResult(WalkTextBatchResult),
    Error {
        code: i32,
        message: String,
    },
}

pub fn write_framed_bincode<W: Write, T: Serialize>(writer: &mut W, msg: &T) -> Result<(), FramingError> {
    let payload = bincode::serialize(msg)?;
    let len = u32::try_from(payload.len()).map_err(|_| FramingError::FrameTooLarge {
        len: payload.len(),
    })?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(&payload)?;
    Ok(())
}

pub fn read_framed_bincode<R: Read, T: for<'de> Deserialize<'de>>(reader: &mut R) -> Result<T, FramingError> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > MAX_FRAME_BYTES {
        return Err(FramingError::FrameTooLarge { len });
    }
    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload)?;
    Ok(bincode::deserialize(&payload)?)
}

fn native_search_body_from_value(value: Value) -> Result<NativeSearchQueryBody, String> {
    serde_json::from_value(value).map_err(|e| e.to_string())
}

fn dispatch(req: NativeRequest) -> NativeResponse {
    match req {
        NativeRequest::Ping => NativeResponse::PingResult {
            ok: true,
            service: "the-search-thing-sidecar".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            index_mode: "rust-text".into(),
            search_mode: "rust-helix".into(),
        },
        NativeRequest::SearchQuery { query } => {
            let started = Instant::now();
            match search_query_value(&query) {
                Ok(value) => match native_search_body_from_value(value) {
                    Ok(body) => {
                        let count = body.results.len();
                        eprintln!(
                            "[sidecar:search:native] completed in {}ms with {} results",
                            started.elapsed().as_millis(),
                            count
                        );
                        NativeResponse::SearchQueryResult(body)
                    }
                    Err(message) => {
                        eprintln!(
                            "[sidecar:search:native] shape error after {}ms: {}",
                            started.elapsed().as_millis(),
                            message
                        );
                        NativeResponse::Error {
                            code: -32603,
                            message: format!("search result shape error: {message}"),
                        }
                    }
                },
                Err(message) => {
                    eprintln!(
                        "[sidecar:search:native] failed in {}ms: {}",
                        started.elapsed().as_millis(),
                        message
                    );
                    NativeResponse::Error {
                        code: -32603,
                        message,
                    }
                }
            }
        }
        NativeRequest::WalkTextBatch(params) => match walk_text_batch(params) {
            Ok(result) => NativeResponse::WalkTextBatchResult(result),
            Err(message) => NativeResponse::Error {
                code: -32603,
                message,
            },
        },
    }
}

/// Run framed-bincode request/response loop on stdio until EOF on stdin.
pub fn run_stdio_loop() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdin = stdin.lock();
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    eprintln!(
        "[sidecar] native IPC enabled (THE_SEARCH_THING_IPC_MODE=native); framed bincode on stdio"
    );

    loop {
        let req: NativeRequest = match read_framed_bincode(&mut stdin) {
            Ok(r) => r,
            Err(e) => {
                if matches!(&e, FramingError::Io(ioe) if ioe.kind() == ErrorKind::UnexpectedEof) {
                    break;
                }
                eprintln!("[sidecar:native] read/decode error: {e}");
                let resp = NativeResponse::Error {
                    code: -32700,
                    message: e.to_string(),
                };
                let _ = write_framed_bincode(&mut stdout, &resp);
                let _ = stdout.flush();
                break;
            }
        };

        let resp = dispatch(req);
        write_framed_bincode(&mut stdout, &resp).map_err(framing_to_io)?;
        stdout.flush()?;
    }

    Ok(())
}

fn framing_to_io(e: FramingError) -> io::Error {
    match e {
        FramingError::Io(ioe) => ioe,
        other => io::Error::other(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn framed_ping_roundtrip() {
        let req = NativeRequest::Ping;
        let mut buf = Vec::new();
        write_framed_bincode(&mut buf, &req).unwrap();
        let mut cur = Cursor::new(buf);
        let got: NativeRequest = read_framed_bincode(&mut cur).unwrap();
        assert_eq!(got, req);
    }

    #[test]
    fn dispatch_ping_matches_health_metadata() {
        let NativeResponse::PingResult {
            ok,
            service,
            search_mode,
            ..
        } = dispatch(NativeRequest::Ping)
        else {
            panic!("expected PingResult");
        };
        assert!(ok);
        assert_eq!(service, "the-search-thing-sidecar");
        assert_eq!(search_mode, "rust-helix");
    }
}
