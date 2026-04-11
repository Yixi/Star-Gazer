//! PTY 进程管理器
//! 参考 VSCode 的 PtyHostService 设计，管理多个 PTY 实例

use std::collections::HashMap;
use std::sync::Mutex;

/// PTY 实例信息
pub struct PtyInstance {
    pub id: String,
    pub pid: u32,
    // TODO: 添加 portable-pty 的 MasterPty 和 Child 句柄
}

/// PTY 管理器 - 管理所有活跃的终端进程
pub struct PtyManager {
    instances: Mutex<HashMap<String, PtyInstance>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
        }
    }

    /// 创建新的 PTY 进程
    pub fn create(
        &self,
        id: &str,
        _cwd: &str,
        _cols: u16,
        _rows: u16,
    ) -> Result<u32, String> {
        // TODO: 实现 portable-pty 创建逻辑
        // 1. 配置 CommandBuilder（使用用户默认 shell）
        // 2. 创建 PtyPair
        // 3. 启动子进程
        // 4. 存储实例

        let instance = PtyInstance {
            id: id.to_string(),
            pid: 0,
        };

        self.instances
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.to_string(), instance);

        Ok(0)
    }

    /// 向 PTY 写入数据
    pub fn write(&self, _id: &str, _data: &[u8]) -> Result<(), String> {
        // TODO: 通过 MasterPty writer 写入数据
        Ok(())
    }

    /// 调整 PTY 尺寸
    pub fn resize(&self, _id: &str, _cols: u16, _rows: u16) -> Result<(), String> {
        // TODO: 调用 MasterPty.resize()
        Ok(())
    }

    /// 关闭 PTY 进程
    pub fn close(&self, id: &str) -> Result<(), String> {
        // TODO: kill 子进程，清理资源
        self.instances
            .lock()
            .map_err(|e| e.to_string())?
            .remove(id);
        Ok(())
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}
