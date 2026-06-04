use std::process::{Command, Stdio};

use the_search_thing::sidecar::native_ipc::{
    read_framed_bincode, write_framed_bincode, NativeRequest, NativeResponse,
};
use the_search_thing::sidecar::rpc::fs::WalkTextBatchParams;

fn sidecar_bin() -> &'static str {
    env!("CARGO_BIN_EXE_the-search-thing-sidecar")
}

fn run_native_exchange(req: NativeRequest) -> NativeResponse {
    let mut cmd = Command::new(sidecar_bin());
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .env("THE_SEARCH_THING_IPC_MODE", "native");

    let mut child = cmd.spawn().expect("spawn sidecar");

    {
        let mut stdin = child.stdin.take().expect("stdin");
        write_framed_bincode(&mut stdin, &req).expect("encode request");
    }

    let output = child.wait_with_output().expect("wait sidecar");
    assert!(output.status.success(), "sidecar exited non-zero");

    let mut stdout = output.stdout.as_slice();
    read_framed_bincode(&mut stdout).expect("decode response")
}

#[test]
fn native_ipc_ping() {
    match run_native_exchange(NativeRequest::Ping) {
        NativeResponse::PingResult { ok, service, .. } => {
            assert!(ok);
            assert_eq!(service, "the-search-thing-sidecar");
        }
        other => panic!("unexpected response: {other:?}"),
    }
}

#[test]
fn native_ipc_walk_text_batch() {
    let dir = tempfile::tempdir().expect("tempdir");
    std::fs::write(dir.path().join("one.txt"), "alpha").expect("write");
    std::fs::write(dir.path().join("two.md"), "beta").expect("write");

    let params = WalkTextBatchParams {
        dir: dir.path().to_string_lossy().to_string(),
        text_exts: vec![".txt".into(), ".md".into()],
        ignore_exts: vec![],
        ignore_files: vec![],
        cursor: 0,
        batch_size: 10,
    };

    match run_native_exchange(NativeRequest::WalkTextBatch(params)) {
        NativeResponse::WalkTextBatchResult(result) => {
            assert!(result.done);
            assert!(result.batch.len() >= 2);
        }
        NativeResponse::Error { message, .. } => panic!("unexpected error: {message}"),
        other => panic!("unexpected response: {other:?}"),
    }
}
