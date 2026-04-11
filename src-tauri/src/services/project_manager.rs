//! 项目管理服务
//! 管理项目列表的持久化存储

use crate::types::models::Project;
use std::sync::Mutex;

/// 项目管理器
pub struct ProjectManager {
    projects: Mutex<Vec<Project>>,
}

impl ProjectManager {
    pub fn new() -> Self {
        Self {
            projects: Mutex::new(Vec::new()),
        }
    }

    /// 加载项目列表（从本地存储）
    pub fn load(&self) -> Result<Vec<Project>, String> {
        // TODO: 从 app_data_dir 中读取 projects.json
        let projects = self.projects.lock().map_err(|e| e.to_string())?;
        Ok(projects.clone())
    }

    /// 保存项目列表
    pub fn save(&self) -> Result<(), String> {
        // TODO: 写入 projects.json 到 app_data_dir
        Ok(())
    }

    /// 添加项目
    pub fn add(&self, project: Project) -> Result<(), String> {
        let mut projects = self.projects.lock().map_err(|e| e.to_string())?;
        projects.push(project);
        drop(projects);
        self.save()
    }

    /// 移除项目
    pub fn remove(&self, id: &str) -> Result<(), String> {
        let mut projects = self.projects.lock().map_err(|e| e.to_string())?;
        projects.retain(|p| p.id != id);
        drop(projects);
        self.save()
    }
}

impl Default for ProjectManager {
    fn default() -> Self {
        Self::new()
    }
}
