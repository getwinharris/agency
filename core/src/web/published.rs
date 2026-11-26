//! Per-host dispatch for operator-published artifacts.

use super::{Site, asset_type, host, static_response};
use crate::site_release::{SiteAsset, SiteStore, is_site_host};
use axum::{
    body::Body,
    extract::{Request, State},
    http::{Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::{
    io::{self, Read},
    path::Path,
    sync::Arc,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc};
use tokio_stream::wrappers::ReceiverStream;

const CHUNK_BYTES: usize = 64 * 1024;
const MAX_READERS: usize = 16;

pub(super) struct PublishedSites {
    store: SiteStore,
    readers: Arc<Semaphore>,
}

impl PublishedSites {
    pub(super) fn open(path: &Path) -> io::Result<Self> {
        Ok(Self {
            store: SiteStore::open(path)?,
            readers: Arc::new(Semaphore::new(MAX_READERS)),
        })
    }
}

pub(super) async fn dispatch(
    State(site): State<Arc<Site>>,
    request: Request,
    next: Next,
) -> Response {
    let Some(hostname) = host(request.headers()).filter(|name| is_site_host(name)) else {
        return next.run(request).await;
    };
    let Some(published) = site.published.clone() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(permit) = Arc::clone(&published.readers).try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let path = request.uri().path().to_owned();
    let Ok(Ok(asset)) =
        tokio::task::spawn_blocking(move || published.store.resolve(&hostname, &path)).await
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let content_type = asset_type(&asset.path).unwrap_or("application/octet-stream");
    let length = asset.length;
    let body = match *request.method() {
        Method::GET => stream_asset(asset, permit),
        Method::HEAD => Body::empty(),
        _ => {
            return (
                StatusCode::METHOD_NOT_ALLOWED,
                [(header::ALLOW, "GET, HEAD")],
            )
                .into_response();
        }
    };
    static_response(body, length, content_type, "no-cache")
}

fn stream_asset(asset: SiteAsset, permit: OwnedSemaphorePermit) -> Body {
    let (sender, receiver) = mpsc::channel(2);
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let mut file = asset.file;
        let mut remaining = asset.length;
        while remaining != 0 {
            let mut chunk = vec![0; remaining.min(CHUNK_BYTES as u64) as usize];
            if let Err(error) = file.read_exact(&mut chunk) {
                let _ = sender.blocking_send(Err(error));
                break;
            }
            remaining -= chunk.len() as u64;
            if sender.blocking_send(Ok(chunk)).is_err() {
                break;
            }
        }
    });
    Body::from_stream(ReceiverStream::new(receiver))
}
