//! 文件监听服务
//! 使用 notify crate 监听文件系统变更

use std::collections::HashMap;
use std::sync::Mutex;

/// 文件监听管理器
pub struct FileWatcherManager {
    // TODO: 存储 notify::RecommendedWatcher 实例
    _watchers: Mutex<HashMap<String, ()>>,
}

impl FileWatcherManager {
    pub fn new() -> Self {
        Self {
            _watchers: Mutex::new(HashMap::new()),
        }
    }

    /// 开始监听目录
    pub fn watch(&self, _path: &str) -> Result<(), String> {
        // TODO: 创建 notify watcher，配置 FSEvent 后端
        // 使用 tauri::AppHandle 发送事件到前端
        Ok(())
    }

    /// 停止监听目录
    pub fn unwatch(&self, _path: &str) -> Result<(), String> {
        // TODO: 移除 watcher
        Ok(())
    }
}

impl Default for FileWatcherManager {
    fn default() -> Self {
        Self::new()
    }
}
