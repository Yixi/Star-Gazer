//! 会话与配置持久化管理
//! 管理 session.json 和 config.json 的读写

use crate::types::models::{AppConfig, Session};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const SESSION_FILE: &str = "session.json";
const CONFIG_FILE: &str = "config.json";

/// 会话管理器 - 持久化会话状态和应用配置
pub struct SessionManager {
    session: Mutex<Session>,
    config: Mutex<AppConfig>,
    storage_dir: PathBuf,
}

impl SessionManager {
    pub fn new() -> Self {
        let storage_dir = Self::get_storage_dir();

        // 确保存储目录存在
        if let Err(e) = fs::create_dir_all(&storage_dir) {
            log::error!("创建存储目录失败: {}", e);
        }

        let session = Self::load_json::<Session>(&storage_dir.join(SESSION_FILE))
            .unwrap_or_default();
        let config =
            Self::load_json::<AppConfig>(&storage_dir.join(CONFIG_FILE)).unwrap_or_default();

        log::info!("会话状态已加载");
        log::info!("应用配置已加载 (theme={})", config.theme);

        Self {
            session: Mutex::new(session),
            config: Mutex::new(config),
            storage_dir,
        }
    }

    /// 获取存储目录
    fn get_storage_dir() -> PathBuf {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("Library")
            .join("Application Support")
            .join("com.stargazer.app")
    }

    /// 从 JSON 文件加载数据
    fn load_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> Result<T, String> {
        if !path.exists() {
            return Err("文件不存在".to_string());
        }

        let content = fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))?;

        if content.trim().is_empty() {
            return Err("文件为空".to_string());
        }

        serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {}", e))
    }

    /// 将数据保存为 JSON 文件
    fn save_json<T: serde::Serialize>(path: &PathBuf, data: &T) -> Result<(), String> {
        let content =
            serde_json::to_string_pretty(data).map_err(|e| format!("序列化失败: {}", e))?;

        fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
    }

    // ========== Session 操作 ==========

    /// 获取当前会话状态
    pub fn get_session(&self) -> Result<Session, String> {
        let session = self.session.lock().map_err(|e| e.to_string())?;
        Ok(session.clone())
    }

    /// 保存会话状态
    pub fn save_session(&self, session: Session) -> Result<(), String> {
        let path = self.storage_dir.join(SESSION_FILE);
        Self::save_json(&path, &session)?;

        let mut current = self.session.lock().map_err(|e| e.to_string())?;
        *current = session;

        Ok(())
    }

    // ========== Config 操作 ==========

    /// 获取当前应用配置
    pub fn get_config(&self) -> Result<AppConfig, String> {
        let config = self.config.lock().map_err(|e| e.to_string())?;
        Ok(config.clone())
    }

    /// 保存应用配置
    pub fn save_config(&self, config: AppConfig) -> Result<(), String> {
        let path = self.storage_dir.join(CONFIG_FILE);
        Self::save_json(&path, &config)?;

        let mut current = self.config.lock().map_err(|e| e.to_string())?;
        *current = config;

        Ok(())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}
