//! ALLSTRM Common Library
//!
//! Shared types, errors, and configuration utilities used across all services.

pub mod config;
#[cfg(feature = "database")]
pub mod db;
pub mod error;
pub mod id;

pub use error::{Error, Result};
pub use id::*;
