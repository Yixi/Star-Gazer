//! PTY 进程管理器
//! 参考 VSCode 的 PtyHostService 设计，管理多个 PTY 实例

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// 终端输出事件 payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub terminal_id: String,
    pub data: Vec<u8>,
}

/// 终端退出事件 payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitPayload {
    pub terminal_id: String,
    pub exit_code: Option<u32>,
}

/// PTY 实例信息
///
/// 写入路径通过 mpsc channel 串行化到一个专用写入线程，复刻 VSCode/node-pty
/// 的 `_writeQueue` 模型：命令端只做 send，保证 FIFO；真实 `write_all`/`flush`
/// 全部由写线程按序执行，避免并发 Tauri async command 抢锁导致乱序。
pub struct PtyInstance {
    pub id: String,
    pub pid: u32,
    pub master: Box<dyn MasterPty + Send>,
    pub write_tx: mpsc::Sender<Vec<u8>>,
}

/// PTY 管理器 - 管理所有活跃的终端进程
pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 创建新的 PTY 进程
    pub fn create(
        &self,
        app: AppHandle,
        id: &str,
        cwd: &str,
        cols: u16,
        rows: u16,
        _command: Option<String>,
    ) -> Result<u32, String> {
        let pty_system = native_pty_system();

        // 创建 PTY pair
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("创建 PTY 失败: {}", e))?;

        // 获取用户默认 shell
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

        // 始终启动交互式 login shell（参考 VSCode 方案）
        // macOS GUI 应用从 Finder 启动时不继承 .zshrc/.zprofile 中的 PATH
        // Agent 命令（claude、codex 等）通过前端在 shell 就绪后自动输入执行
        // 这样 agent 退出后用户仍可继续使用 shell
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");

        // 设置工作目录
        cmd.cwd(cwd);

        // 设置终端环境变量
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("LANG", std::env::var("LANG").unwrap_or_else(|_| "en_US.UTF-8".to_string()));

        // 在 slave 上启动进程
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("启动进程失败: {}", e))?;

        let pid = child.process_id().unwrap_or(0);

        // 获取 reader 和 writer
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("获取 reader 失败: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("获取 writer 失败: {}", e))?;

        // 建 mpsc channel 驱动一个专用写入线程：所有 write 命令按 send 顺序入队，
        // 写线程串行执行 write_all + flush，保证跨并发 invoke 的字节顺序。
        let (write_tx, write_rx) = mpsc::channel::<Vec<u8>>();
        let writer_thread_id = id.to_string();
        std::thread::spawn(move || {
            Self::drain_writes(writer_thread_id, writer, write_rx);
        });

        // 存储实例
        let instance = PtyInstance {
            id: id.to_string(),
            pid,
            master: pair.master,
            write_tx,
        };

        // 如果同 ID 的旧实例存在（React Strict Mode 双重挂载），先清理
        let mut instances = self.instances.lock().map_err(|e| e.to_string())?;
        if let Some(old) = instances.remove(id) {
            log::info!("清理同 ID 旧 PTY 实例: id={}", id);
            // drop sender 让写线程退出 recv 循环并释放真实 writer（产生 EOF）
            drop(old.write_tx);
            drop(old.master);
            if old.pid > 0 {
                unsafe { libc::kill(old.pid as i32, libc::SIGTERM); }
            }
        }
        instances.insert(id.to_string(), instance);
        drop(instances);

        // 启动异步任务读取 PTY 输出
        let terminal_id = id.to_string();
        let instances_clone = Arc::clone(&self.instances);
        std::thread::spawn(move || {
            Self::read_output(app, reader, child, terminal_id, instances_clone);
        });

        log::info!("PTY 创建成功: id={}, pid={}", id, pid);
        Ok(pid)
    }

    /// 读取 PTY 输出并发送到前端
    fn read_output(
        app: AppHandle,
        mut reader: Box<dyn Read + Send>,
        mut child: Box<dyn portable_pty::Child + Send + Sync>,
        terminal_id: String,
        instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
    ) {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF - 进程已退出
                    break;
                }
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    let payload = TerminalOutputPayload {
                        terminal_id: terminal_id.clone(),
                        data,
                    };
                    if let Err(e) = app.emit("terminal-output", &payload) {
                        log::error!("发送终端输出事件失败: {}", e);
                        break;
                    }
                }
                Err(e) => {
                    log::error!("读取 PTY 输出失败: {}", e);
                    break;
                }
            }
        }

        // 获取退出码
        let exit_code = match child.wait() {
            Ok(status) => {
                if status.success() {
                    Some(0)
                } else {
                    // ExitStatus 没有直接暴露 code，如果不成功则返回 1
                    Some(1)
                }
            }
            Err(_) => None,
        };

        // 通知前端进程已退出
        let exit_payload = TerminalExitPayload {
            terminal_id: terminal_id.clone(),
            exit_code,
        };
        let _ = app.emit("terminal-exit", &exit_payload);

        // 从实例列表中移除
        if let Ok(mut map) = instances.lock() {
            map.remove(&terminal_id);
        }

        log::info!("PTY 进程退出: id={}", terminal_id);
    }

    /// 向 PTY 写入数据
    ///
    /// 只做 send：命令协程立即返回，实际写入交给专用写线程串行执行。
    /// 这样无论 Tauri 把多少个 write_terminal 命令并发 spawn 到 tokio，
    /// 字节进入 channel 的顺序就是最终落到 PTY 的顺序。
    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let instances = self.instances.lock().map_err(|e| e.to_string())?;
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("终端 {} 不存在", id))?;

        instance
            .write_tx
            .send(data.to_vec())
            .map_err(|_| format!("终端 {} 写入通道已关闭", id))?;

        Ok(())
    }

    /// 写入线程主循环：串行消费 channel 中的字节块并写入真实 writer。
    ///
    /// 对照 node-pty 的 `_writeQueue.push` + `_processWriteQueue`：
    /// 只要在入口处保证 FIFO，下游就不会再乱序。
    fn drain_writes(
        id: String,
        mut writer: Box<dyn Write + Send>,
        rx: mpsc::Receiver<Vec<u8>>,
    ) {
        while let Ok(chunk) = rx.recv() {
            if let Err(e) = writer.write_all(&chunk) {
                log::error!("PTY 写入失败 id={}: {}", id, e);
                break;
            }
            if let Err(e) = writer.flush() {
                log::error!("PTY flush 失败 id={}: {}", id, e);
                break;
            }
        }
        // 退出时 writer 被 drop，slave 端会收到 EOF
        log::debug!("PTY 写入线程退出: id={}", id);
    }

    /// 调整 PTY 尺寸
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instances = self.instances.lock().map_err(|e| e.to_string())?;
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("终端 {} 不存在", id))?;

        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("调整 PTY 尺寸失败: {}", e))?;

        Ok(())
    }

    /// 关闭 PTY 进程（先 SIGTERM，3秒后 SIGKILL）
    pub fn close(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().map_err(|e| e.to_string())?;

        if let Some(instance) = instances.remove(id) {
            let pid = instance.pid;
            // 释放 sender 让写线程退出并释放真正的 writer，slave 端会收到 EOF
            drop(instance.write_tx);
            drop(instance.master);

            if pid > 0 {
                // 发送 SIGTERM
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }

                // 3 秒后发送 SIGKILL
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    unsafe {
                        libc::kill(pid as i32, libc::SIGKILL);
                    }
                });
            }

            log::info!("关闭终端: id={}, pid={}", id, pid);
        }

        Ok(())
    }

    /// 关闭所有 PTY 进程（应用退出时调用）
    ///
    /// 先发 SIGTERM 让 shell 优雅退出，之后同步 sleep 500ms 再 SIGKILL 保底 —
    /// 应用正在退出，没必要 spawn 独立线程（那些线程会随进程结束被回收）。
    pub fn close_all(&self) {
        // 收集要关闭的 pid + 释放 writer/master 让 IO 线程收到 EOF
        let mut pids: Vec<u32> = Vec::new();
        // 即使 lock 被 poison 也要尽力关闭
        let mut instances = match self.instances.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let ids: Vec<String> = instances.keys().cloned().collect();
        for id in &ids {
            if let Some(instance) = instances.remove(id) {
                let pid = instance.pid;
                drop(instance.write_tx);
                drop(instance.master);
                if pid > 0 {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                    pids.push(pid);
                }
            }
        }
        drop(instances);

        if !pids.is_empty() {
            // 给 shell 一点时间响应 SIGTERM，然后 SIGKILL 保底
            std::thread::sleep(std::time::Duration::from_millis(500));
            for pid in &pids {
                unsafe {
                    libc::kill(*pid as i32, libc::SIGKILL);
                }
            }
        }

        log::info!("已关闭所有 PTY 进程 ({}个)", ids.len());
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}
