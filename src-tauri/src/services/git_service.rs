//! Git 命令封装
//! 参考 VSCode 的实现，通过 shell out 到系统 git 命令

use crate::types::models::{GitBranch, GitFileChange, GitLogEntry, GitStatusSummary};
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
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.trim().is_empty() {
                // 有些 git 命令失败时 stderr 为空
                Err(format!("git 命令执行失败，退出码: {:?}", output.status.code()))
            } else {
                Err(stderr)
            }
        }
    }

    /// 解析 git status --porcelain=v2 --branch 输出
    pub fn status(repo_path: &str) -> Result<GitStatusSummary, String> {
        let output = Self::exec(repo_path, &["status", "--porcelain=v2", "--branch"])?;

        let mut branch = String::new();
        let mut ahead = 0i32;
        let mut behind = 0i32;
        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();

        for line in output.lines() {
            if line.starts_with("# branch.head ") {
                branch = line.strip_prefix("# branch.head ").unwrap_or("").to_string();
            } else if line.starts_with("# branch.ab ") {
                // 格式: # branch.ab +N -M
                let ab = line.strip_prefix("# branch.ab ").unwrap_or("");
                for part in ab.split_whitespace() {
                    if let Some(n) = part.strip_prefix('+') {
                        ahead = n.parse().unwrap_or(0);
                    } else if let Some(n) = part.strip_prefix('-') {
                        behind = n.parse().unwrap_or(0);
                    }
                }
            } else if line.starts_with("1 ") || line.starts_with("2 ") {
                // 普通变更条目 (1) 或重命名条目 (2)
                // 格式: 1 XY sub mH mI mW hH hI path
                // 格式: 2 XY sub mH mI mW hH hI X score path\torigPath
                let parts: Vec<&str> = line.splitn(9, ' ').collect();
                if parts.len() >= 9 {
                    let xy = parts[1];
                    let x = xy.chars().next().unwrap_or('.');
                    let y = xy.chars().nth(1).unwrap_or('.');

                    // 对于 type 2（重命名），path 可能包含 tab
                    let path = if line.starts_with("2 ") {
                        // 重命名的格式中，最后一个字段是 path\torigPath
                        parts[8].split('\t').next().unwrap_or(parts[8]).to_string()
                    } else {
                        parts[8].to_string()
                    };

                    // X 表示暂存区状态
                    if x != '.' {
                        staged.push(GitFileChange {
                            path: path.clone(),
                            status: Self::status_char_to_string(x),
                        });
                    }

                    // Y 表示工作区状态
                    if y != '.' {
                        unstaged.push(GitFileChange {
                            path,
                            status: Self::status_char_to_string(y),
                        });
                    }
                }
            } else if line.starts_with("? ") {
                // 未跟踪文件
                let path = line.strip_prefix("? ").unwrap_or("").to_string();
                untracked.push(path);
            }
        }

        Ok(GitStatusSummary {
            branch,
            ahead,
            behind,
            staged,
            unstaged,
            untracked,
        })
    }

    /// 将 status 字符转换为可读字符串
    fn status_char_to_string(c: char) -> String {
        match c {
            'M' => "modified".to_string(),
            'T' => "typechange".to_string(),
            'A' => "added".to_string(),
            'D' => "deleted".to_string(),
            'R' => "renamed".to_string(),
            'C' => "copied".to_string(),
            'U' => "unmerged".to_string(),
            _ => format!("unknown({})", c),
        }
    }

    /// 获取文件 diff（同时包含 staged 和 unstaged）
    pub fn diff(repo_path: &str, file_path: Option<&str>) -> Result<String, String> {
        let mut result = String::new();

        // unstaged 变更
        let mut args = vec!["diff"];
        if let Some(fp) = file_path {
            args.push("--");
            args.push(fp);
        }
        match Self::exec(repo_path, &args) {
            Ok(diff) => {
                if !diff.is_empty() {
                    result.push_str(&diff);
                }
            }
            Err(e) => log::warn!("获取 unstaged diff 失败: {}", e),
        }

        // staged 变更
        let mut args_cached = vec!["diff", "--cached"];
        if let Some(fp) = file_path {
            args_cached.push("--");
            args_cached.push(fp);
        }
        match Self::exec(repo_path, &args_cached) {
            Ok(diff) => {
                if !diff.is_empty() {
                    if !result.is_empty() {
                        result.push('\n');
                    }
                    result.push_str(&diff);
                }
            }
            Err(e) => log::warn!("获取 staged diff 失败: {}", e),
        }

        Ok(result)
    }

    /// 获取分支列表
    pub fn branches(repo_path: &str) -> Result<Vec<GitBranch>, String> {
        let output = Self::exec(
            repo_path,
            &[
                "branch",
                "-a",
                "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)",
            ],
        )?;

        let mut branches = Vec::new();

        for line in output.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.is_empty() {
                continue;
            }

            let name = parts[0].trim().to_string();
            let is_head = parts.get(1).map(|s| s.trim() == "*").unwrap_or(false);
            let upstream = parts
                .get(2)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            if !name.is_empty() {
                branches.push(GitBranch {
                    name,
                    is_head,
                    upstream,
                });
            }
        }

        Ok(branches)
    }

    /// 获取 git 日志
    pub fn log(repo_path: &str, limit: u32) -> Result<Vec<GitLogEntry>, String> {
        let output = Self::exec(
            repo_path,
            &[
                "log",
                &format!("-n{}", limit),
                "--format=%H\t%h\t%an\t%ae\t%at\t%s",
            ],
        )?;

        let mut entries = Vec::new();

        for line in output.lines() {
            let parts: Vec<&str> = line.splitn(6, '\t').collect();
            if parts.len() >= 6 {
                entries.push(GitLogEntry {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    author_name: parts[2].to_string(),
                    author_email: parts[3].to_string(),
                    timestamp: parts[4].parse().unwrap_or(0),
                    message: parts[5].to_string(),
                });
            }
        }

        Ok(entries)
    }

    /// 检查路径是否是 git 仓库
    pub fn is_git_repo(path: &str) -> bool {
        Self::exec(path, &["rev-parse", "--git-dir"]).is_ok()
    }
}
