//! 项目管理服务
//! 管理项目列表的持久化存储

use crate::types::models::Project;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// 应用数据目录下的项目列表文件名
const PROJECTS_FILE: &str = "projects.json";

/// 项目管理器
pub struct ProjectManager {
    projects: Mutex<Vec<Project>>,
    storage_path: PathBuf,
}

impl ProjectManager {
    /// 创建项目管理器并从磁盘加载数据
    pub fn new() -> Self {
        let storage_dir = Self::get_storage_dir();
        let storage_path = storage_dir.join(PROJECTS_FILE);

        // 确保存储目录存在
        if let Err(e) = fs::create_dir_all(&storage_dir) {
            log::error!("创建存储目录失败: {}", e);
        }

        let projects = Self::load_from_file(&storage_path).unwrap_or_default();
        log::info!("加载了 {} 个项目", projects.len());

        Self {
            projects: Mutex::new(projects),
            storage_path,
        }
    }

    /// 获取应用数据存储目录
    fn get_storage_dir() -> PathBuf {
        // macOS: ~/Library/Application Support/com.stargazer.app/
        if let Some(home) = dirs_next_home() {
            home.join("Library")
                .join("Application Support")
                .join("com.stargazer.app")
        } else {
            // fallback
            PathBuf::from(".")
        }
    }

    /// 从文件加载项目列表
    fn load_from_file(path: &PathBuf) -> Result<Vec<Project>, String> {
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content =
            fs::read_to_string(path).map_err(|e| format!("读取项目文件失败: {}", e))?;

        if content.trim().is_empty() {
            return Ok(Vec::new());
        }

        serde_json::from_str(&content).map_err(|e| format!("解析项目文件失败: {}", e))
    }

    /// 保存项目列表到文件
    fn save_to_file(&self, projects: &[Project]) -> Result<(), String> {
        let content = serde_json::to_string_pretty(projects)
            .map_err(|e| format!("序列化项目列表失败: {}", e))?;

        fs::write(&self.storage_path, content).map_err(|e| format!("写入项目文件失败: {}", e))
    }

    /// 获取项目列表
    pub fn list(&self) -> Result<Vec<Project>, String> {
        let projects = self.projects.lock().map_err(|e| e.to_string())?;
        Ok(projects.clone())
    }

    /// 添加项目
    pub fn add(&self, project: Project) -> Result<(), String> {
        let mut projects = self.projects.lock().map_err(|e| e.to_string())?;

        // 检查是否已存在同路径的项目
        if projects.iter().any(|p| p.path == project.path) {
            // 更新 last_opened 时间
            for p in projects.iter_mut() {
                if p.path == project.path {
                    p.last_opened = project.last_opened;
                    break;
                }
            }
        } else {
            projects.push(project);
        }

        self.save_to_file(&projects)
    }

    /// 移除项目（不删除文件）
    pub fn remove(&self, id: &str) -> Result<(), String> {
        let mut projects = self.projects.lock().map_err(|e| e.to_string())?;
        projects.retain(|p| p.id != id);
        self.save_to_file(&projects)
    }

    /// 更新项目的最后打开时间
    pub fn touch(&self, id: &str) -> Result<(), String> {
        let mut projects = self.projects.lock().map_err(|e| e.to_string())?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        for project in projects.iter_mut() {
            if project.id == id {
                project.last_opened = now;
                break;
            }
        }

        self.save_to_file(&projects)
    }
}

impl Default for ProjectManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 获取用户 home 目录（不依赖外部 crate）
fn dirs_next_home() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}
