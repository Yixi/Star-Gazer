//! Git 命令封装
//! 参考 VSCode 的实现，通过 shell out 到系统 git 命令

use std::process::Command;

/// Git 服务 - 封装 git 命令调用
pub struct GitService;

impl GitService {
    /// 执行 git 命令
    fn exec(repo_path: &str, args: &[&str]) -> Result<String, String> {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("执行 git 命令失败: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// 获取当前分支名
    pub fn current_branch(repo_path: &str) -> Result<String, String> {
        let output = Self::exec(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        Ok(output.trim().to_string())
    }

    /// 获取 porcelain v2 格式的状态
    pub fn status_porcelain(repo_path: &str) -> Result<String, String> {
        Self::exec(repo_path, &["status", "--porcelain=v2", "--branch"])
    }

    /// 获取文件 diff
    pub fn diff_file(repo_path: &str, file_path: &str) -> Result<String, String> {
        Self::exec(repo_path, &["diff", "--", file_path])
    }

    /// 获取分支列表
    pub fn list_branches(repo_path: &str) -> Result<String, String> {
        Self::exec(
            repo_path,
            &["branch", "-a", "--format=%(refname:short) %(HEAD) %(upstream:short)"],
        )
    }

    /// 获取 git 日志
    pub fn log(repo_path: &str, limit: u32) -> Result<String, String> {
        Self::exec(
            repo_path,
            &["log", "--oneline", &format!("-n{}", limit)],
        )
    }

    /// 检查路径是否是 git 仓库
    pub fn is_git_repo(path: &str) -> bool {
        Self::exec(path, &["rev-parse", "--git-dir"]).is_ok()
    }
}
