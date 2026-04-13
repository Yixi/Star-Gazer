//! Git 命令封装
//! 参考 VSCode 的实现，通过 shell out 到系统 git 命令

use crate::types::models::{
    GitBranch, GitCommitDetail, GitFileChange, GitLogEntry, GitStatusSummary,
};
use std::collections::HashMap;
use std::process::Command;

/// Git 服务 - 封装 git 命令调用
pub struct GitService;

/// 校验 git ref（commit hash / 分支名 / tag）字符串是否安全
///
/// 拒绝：空字符串、前导 `-`（防止被 git 当 flag 解析）、换行/空格/特殊字符
/// 允许：SHA、分支名、`HEAD`、`HEAD~1`、`main^` 等常见形态
///
/// 注意：这是 defense-in-depth，真正的仓库内合法性由 git 自己拒绝
fn validate_git_ref(r: &str) -> Result<(), String> {
    if r.is_empty() {
        return Err("git ref 不能为空".to_string());
    }
    if r.starts_with('-') {
        return Err("git ref 不能以 '-' 开头".to_string());
    }
    // 只允许：字母数字、/ . _ - ~ ^ @ { }
    // 禁止空白、换行、引号、通配符、shell 元字符
    const ALLOWED: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/._-~^@{}";
    for ch in r.chars() {
        if !ALLOWED.contains(ch) {
            return Err(format!("git ref 包含非法字符: {:?}", ch));
        }
    }
    Ok(())
}

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
                Err(format!(
                    "git 命令执行失败，退出码: {:?}",
                    output.status.code()
                ))
            } else {
                Err(stderr)
            }
        }
    }

    /// 解析 git diff --numstat 输出，返回 (path -> (additions, deletions)) 映射
    fn parse_numstat(output: &str) -> HashMap<String, (u32, u32)> {
        let mut stats = HashMap::new();
        for line in output.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                // 二进制文件会显示 "-" 而不是数字
                let additions = parts[0].parse::<u32>().unwrap_or(0);
                let deletions = parts[1].parse::<u32>().unwrap_or(0);
                let path = parts[2].to_string();
                stats.insert(path, (additions, deletions));
            }
        }
        stats
    }

    /// 解析 git status --porcelain=v2 --branch 输出
    ///
    /// `--untracked-files=all` 让 git 展开新目录里的每个文件，避免出现
    /// `? path/to/dir/` 这种带尾斜杠的目录条目（前端拿不到文件名）。
    pub fn status(repo_path: &str) -> Result<GitStatusSummary, String> {
        let output = Self::exec(
            repo_path,
            &["status", "--porcelain=v2", "--branch", "--untracked-files=all"],
        )?;

        // 获取 unstaged 和 staged 的 numstat
        let unstaged_stats = Self::exec(repo_path, &["diff", "--numstat"])
            .map(|s| Self::parse_numstat(&s))
            .unwrap_or_default();

        let staged_stats = Self::exec(repo_path, &["diff", "--cached", "--numstat"])
            .map(|s| Self::parse_numstat(&s))
            .unwrap_or_default();

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
                        parts[8].split('\t').next().unwrap_or(parts[8]).to_string()
                    } else {
                        parts[8].to_string()
                    };

                    // X 表示暂存区状态
                    if x != '.' {
                        let (additions, deletions) =
                            staged_stats.get(&path).copied().unwrap_or((0, 0));
                        staged.push(GitFileChange {
                            path: path.clone(),
                            status: Self::status_char_to_string(x),
                            additions,
                            deletions,
                        });
                    }

                    // Y 表示工作区状态
                    if y != '.' {
                        let (additions, deletions) =
                            unstaged_stats.get(&path).copied().unwrap_or((0, 0));
                        unstaged.push(GitFileChange {
                            path,
                            status: Self::status_char_to_string(y),
                            additions,
                            deletions,
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
    ///
    /// 对 untracked 文件（从未 `git add` 过的新文件）做特殊处理：
    /// `git diff` 不会报告它们，这里直接读取文件内容合成一份 "new file"
    /// unified diff，让前端的 react-diff-view 能正常渲染"全绿"新增视图。
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

        // fallback: 如果指定了文件且 git diff 没拿到任何内容，检查是否 untracked
        // 是的话合成 new file diff 返回，避免前端显示"没有检测到差异"
        if result.is_empty() {
            if let Some(fp) = file_path {
                if let Ok(synthetic) = Self::synthesize_untracked_diff(repo_path, fp) {
                    if !synthetic.is_empty() {
                        result = synthetic;
                    }
                }
            }
        }

        Ok(result)
    }

    /// 为 untracked 文件合成一份 "new file" unified diff
    ///
    /// 只有在文件确实 untracked 且可读时才返回非空；否则返回 `Ok("")`，
    /// 让调用方按原样继续处理（例如 tracked 但无改动 → 真的就没有差异）。
    fn synthesize_untracked_diff(repo_path: &str, file_path: &str) -> Result<String, String> {
        use std::path::PathBuf;

        // 归一化路径：file_path 可能是绝对（FileTree 传的 data.path）或相对（仓库内）
        let full_path = {
            let p = PathBuf::from(file_path);
            if p.is_absolute() {
                p
            } else {
                PathBuf::from(repo_path).join(file_path)
            }
        };

        if !full_path.is_file() {
            return Ok(String::new());
        }

        // 确认文件 untracked：ls-files --error-unmatch 成功说明文件已被追踪
        let ls_files = Command::new("git")
            .args(["ls-files", "--error-unmatch", "--"])
            .arg(&full_path)
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("执行 git ls-files 失败: {}", e))?;
        if ls_files.status.success() {
            // 已追踪但无变更 — 不需要合成
            return Ok(String::new());
        }

        // 读取文件原始字节先判二进制（含 NUL 的视为二进制）
        let bytes = std::fs::read(&full_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        let is_binary = bytes.contains(&0u8);

        // 计算用于 diff header 的相对路径（失败就保持原样）
        let rel_path = {
            let repo_canon = PathBuf::from(repo_path)
                .canonicalize()
                .ok();
            let file_canon = full_path.canonicalize().ok();
            match (repo_canon, file_canon) {
                (Some(r), Some(f)) => f
                    .strip_prefix(&r)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| file_path.to_string()),
                _ => file_path.to_string(),
            }
        };

        let mut out = String::new();
        out.push_str(&format!("diff --git a/{rp} b/{rp}\n", rp = rel_path));
        out.push_str("new file mode 100644\n");

        if is_binary {
            out.push_str(&format!(
                "Binary files /dev/null and b/{} differ\n",
                rel_path
            ));
            return Ok(out);
        }

        let content = String::from_utf8_lossy(&bytes).to_string();
        let lines: Vec<&str> = content.lines().collect();
        let line_count = lines.len();
        out.push_str("--- /dev/null\n");
        out.push_str(&format!("+++ b/{}\n", rel_path));

        if line_count == 0 {
            // 空文件：没有 hunk 内容，只保留 header（足够 react-diff-view 显示"新建空文件"）
            return Ok(out);
        }

        out.push_str(&format!("@@ -0,0 +1,{} @@\n", line_count));
        for line in &lines {
            out.push('+');
            out.push_str(line);
            out.push('\n');
        }
        if !content.ends_with('\n') {
            out.push_str("\\ No newline at end of file\n");
        }

        Ok(out)
    }

    /// git 的空树哈希 —— 可作为任何 commit 的"之前"引用
    /// 用来处理 root commit 没有父节点的场景（`root~` 会 bad revision）
    const EMPTY_TREE: &'static str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

    /// 解析 range 的起点：优先 `{from}^`，若 from 是 root commit 则用空树哈希
    /// 只调用一次 `git rev-parse --verify`，结果缓存在返回的 String 中，避免后续
    /// diff 里重复做父 commit 校验。
    fn range_base(repo_path: &str, from: &str) -> String {
        let parent_ref = format!("{}^", from);
        let is_valid = Self::exec(
            repo_path,
            &["rev-parse", "--verify", "--quiet", &parent_ref],
        )
        .is_ok();
        if is_valid {
            parent_ref
        } else {
            Self::EMPTY_TREE.to_string()
        }
    }

    /// 获取 commit 范围 diff
    /// 等价于 `git diff <from>^..<to>`，即包含 from 本身到 to 的所有改动
    /// 如果指定 file_path，只返回该文件的 diff
    /// 若 from 是 root commit，自动回退到空树哈希，避免 bad revision
    pub fn diff_range(
        repo_path: &str,
        from: &str,
        to: &str,
        file_path: Option<&str>,
    ) -> Result<String, String> {
        validate_git_ref(from)?;
        validate_git_ref(to)?;
        let base = Self::range_base(repo_path, from);
        let range = format!("{}..{}", base, to);
        let mut args = vec!["diff", range.as_str()];
        if let Some(fp) = file_path {
            args.push("--");
            args.push(fp);
        }
        Self::exec(repo_path, &args)
    }

    /// 获取 commit range 涉及的文件列表（单次 diff 聚合）
    ///
    /// 使用 `git diff --name-status --numstat {base}..{to}`，base 默认是 `{from}^`,
    /// 若 from 是 root commit 则回退到空树哈希 —— 这让选中的范围包含 root commit
    /// 时不再触发 `fatal: bad revision`。与 `diff_range` 使用完全一致的 range 计算
    /// 逻辑，保证文件树和右栏 diff 始终同源。
    ///
    /// - 单 commit 选择：`from == to`，等价于该 commit 的 diff
    /// - 多 commit 选择：`from = 最旧, to = 最新`，range 覆盖整个区间的净变更
    pub fn commit_files_range(
        repo_path: &str,
        from: &str,
        to: &str,
    ) -> Result<Vec<GitFileChange>, String> {
        use std::collections::HashMap;

        validate_git_ref(from)?;
        validate_git_ref(to)?;
        let base = Self::range_base(repo_path, from);
        let range = format!("{}..{}", base, to);

        // name-status 取状态，numstat 取行数。两次调用，按 path 合并。
        let name_status = Self::exec(
            repo_path,
            &["diff", "--name-status", range.as_str()],
        )?;
        let numstat = Self::exec(
            repo_path,
            &["diff", "--numstat", range.as_str()],
        )?;

        // 解析 numstat: "<add>\t<del>\t<path>"（二进制文件行是 "-\t-\t<path>"）
        let mut stat_map: HashMap<String, (u32, u32)> = HashMap::new();
        for line in numstat.lines() {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            if parts.len() != 3 {
                continue;
            }
            let additions = parts[0].parse::<u32>().unwrap_or(0);
            let deletions = parts[1].parse::<u32>().unwrap_or(0);
            stat_map.insert(parts[2].to_string(), (additions, deletions));
        }

        // 解析 name-status: "<status>\t<path>" 或 "R100\t<old>\t<new>"
        let mut changes: Vec<GitFileChange> = Vec::new();
        for line in name_status.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 2 {
                continue;
            }
            let status_char = parts[0].chars().next().unwrap_or('.');
            let path = if parts[0].starts_with('R') || parts[0].starts_with('C') {
                // R/C 后面跟 old path 和 new path，取 new path 作为展示路径
                parts.get(2).unwrap_or(&parts[1]).to_string()
            } else {
                parts[1].to_string()
            };

            let (additions, deletions) = stat_map.get(&path).copied().unwrap_or((0, 0));
            let status = Self::status_char_to_string(status_char);

            changes.push(GitFileChange {
                path,
                status,
                additions,
                deletions,
            });
        }

        // 按路径排序，文件树展示更稳定
        changes.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(changes)
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
    /// - `--all`: 包含所有分支的 commits（方便画分支图）
    /// - `%P`: 父 commits
    /// - `%D`: 引用装饰（branch/tag）
    /// - `limit = None` 或 `Some(0)` 表示不限制，返回全部 commits
    pub fn log(repo_path: &str, limit: Option<u32>) -> Result<Vec<GitLogEntry>, String> {
        let limit_arg = match limit {
            Some(n) if n > 0 => Some(format!("-n{}", n)),
            _ => None,
        };
        let mut args: Vec<&str> = vec!["log", "--all"];
        if let Some(ref s) = limit_arg {
            args.push(s);
        }
        args.push("--format=%H\t%h\t%an\t%ae\t%at\t%P\t%D\t%s");

        let output = Self::exec(repo_path, &args)?;

        let mut entries = Vec::new();

        for line in output.lines() {
            let parts: Vec<&str> = line.splitn(8, '\t').collect();
            if parts.len() >= 8 {
                let parents: Vec<String> = parts[5]
                    .split_whitespace()
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect();
                let refs: Vec<String> = if parts[6].is_empty() {
                    Vec::new()
                } else {
                    parts[6]
                        .split(", ")
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect()
                };
                entries.push(GitLogEntry {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    author_name: parts[2].to_string(),
                    author_email: parts[3].to_string(),
                    timestamp: parts[4].parse().unwrap_or(0),
                    parents,
                    refs,
                    message: parts[7].to_string(),
                });
            }
        }

        Ok(entries)
    }

    /// 获取单个 commit 的完整详情（hover tooltip 用）
    ///
    /// 一次 `git show` 同时拿到元信息 + numstat，用 `\0` 作字段分隔避免正文
    /// 里的换行和 tab 把格式搞乱。
    pub fn commit_detail(repo_path: &str, hash: &str) -> Result<GitCommitDetail, String> {
        validate_git_ref(hash)?;

        // format: hash\0short\0an\0ae\0ts\0subject\0body\0
        // 之后紧跟一个换行 + numstat 输出
        let output = Self::exec(
            repo_path,
            &[
                "show",
                "--format=format:%H%x00%h%x00%an%x00%ae%x00%at%x00%s%x00%b%x00",
                "--numstat",
                hash,
            ],
        )?;

        let mut parts = output.splitn(8, '\0');
        let hash_s = parts.next().unwrap_or("").to_string();
        let short_hash = parts.next().unwrap_or("").to_string();
        let author_name = parts.next().unwrap_or("").to_string();
        let author_email = parts.next().unwrap_or("").to_string();
        let timestamp = parts.next().unwrap_or("0").parse::<u64>().unwrap_or(0);
        let subject = parts.next().unwrap_or("").to_string();
        let body = parts.next().unwrap_or("").trim().to_string();
        let rest = parts.next().unwrap_or("");

        // 解析 numstat 统计（`add\tdel\tpath` 或二进制 `-\t-\tpath`）
        let mut files_changed = 0u32;
        let mut insertions = 0u32;
        let mut deletions = 0u32;
        for line in rest.lines() {
            let cols: Vec<&str> = line.splitn(3, '\t').collect();
            if cols.len() != 3 {
                continue;
            }
            files_changed += 1;
            insertions += cols[0].parse::<u32>().unwrap_or(0);
            deletions += cols[1].parse::<u32>().unwrap_or(0);
        }

        Ok(GitCommitDetail {
            hash: hash_s,
            short_hash,
            author_name,
            author_email,
            timestamp,
            subject,
            body,
            files_changed,
            insertions,
            deletions,
        })
    }

    /// 检查路径是否是 git 仓库
    pub fn is_git_repo(path: &str) -> bool {
        Self::exec(path, &["rev-parse", "--git-dir"]).is_ok()
    }

    /// 提交 — 若无 staged 改动则先 `git add -A`（VSCode 的 smart commit 行为）
    ///
    /// 通过 `--file=-` 从 stdin 喂 message，避免 message 里有引号 / 反引号 / `$`
    /// 等被 shell 误解的字符。空 message 拒绝。
    pub fn commit(repo_path: &str, message: &str) -> Result<(), String> {
        let trimmed = message.trim();
        if trimmed.is_empty() {
            return Err("commit message 不能为空".to_string());
        }

        // 检查是否有 staged 改动；没有就把所有 working 变更（含 untracked）暂存
        let cached = Self::exec(repo_path, &["diff", "--cached", "--name-only"])
            .unwrap_or_default();
        if cached.trim().is_empty() {
            Self::exec(repo_path, &["add", "-A"])?;
        }

        // 用 stdin 喂 message —— 比 `-m` 安全，原样保留特殊字符和换行
        use std::io::Write;
        use std::process::Stdio;
        let mut child = Command::new("git")
            .args(["commit", "--file=-"])
            .current_dir(repo_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 git commit 失败: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(message.as_bytes())
                .map_err(|e| format!("写入 commit message 失败: {}", e))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("等待 git commit 失败: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(if stderr.trim().is_empty() {
                format!("git commit 失败，退出码: {:?}", output.status.code())
            } else {
                stderr
            })
        }
    }

    /// 当前分支名（detached HEAD 返回 None）
    fn current_branch(repo_path: &str) -> Option<String> {
        let out = Self::exec(repo_path, &["symbolic-ref", "--quiet", "--short", "HEAD"]).ok()?;
        let name = out.trim();
        if name.is_empty() { None } else { Some(name.to_string()) }
    }

    /// Push 当前分支 — 若没有 upstream 则自动 `-u origin <branch>` 创建追踪
    pub fn push(repo_path: &str) -> Result<(), String> {
        // 先尝试普通 push
        let direct = Command::new("git")
            .args(["push"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("执行 git push 失败: {}", e))?;

        if direct.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&direct.stderr).to_string();

        // 没有 upstream 的典型 stderr 关键字
        let needs_upstream = stderr.contains("has no upstream branch")
            || stderr.contains("no upstream configured")
            || stderr.contains("set-upstream");

        if needs_upstream {
            let branch = Self::current_branch(repo_path)
                .ok_or_else(|| "当前处于 detached HEAD，无法 push".to_string())?;
            // 默认 origin；远端不叫 origin 的项目会失败，让 stderr 透传
            Self::exec(repo_path, &["push", "-u", "origin", &branch])?;
            return Ok(());
        }

        Err(stderr)
    }

    /// Pull 当前分支 — 默认 `--ff-only`，遇 diverged 让用户自己决定 rebase/merge
    pub fn pull(repo_path: &str) -> Result<(), String> {
        Self::exec(repo_path, &["pull", "--ff-only"]).map(|_| ())
    }

    /// Fetch 所有远端 + prune 掉已删除的远端分支
    pub fn fetch(repo_path: &str) -> Result<(), String> {
        Self::exec(repo_path, &["fetch", "--all", "--prune"]).map(|_| ())
    }

    /// 检查给定的相对路径列表哪些被 gitignore 规则直接匹配
    /// 使用 `git check-ignore` 精确检查每个路径自身是否匹配 gitignore 规则
    /// （而不是像 `git status --ignored` 那样在子文件全被忽略时将整个目录报为 ignored）
    pub fn check_ignored(repo_path: &str, paths: Vec<String>) -> Result<Vec<String>, String> {
        if paths.is_empty() {
            return Ok(Vec::new());
        }

        // git check-ignore --stdin 从标准输入读取路径，每行一个
        // 匹配到 gitignore 的路径会输出到 stdout
        // Exit code: 0 表示至少一个匹配，1 表示没有匹配（我们都视为成功）
        use std::io::Write;
        use std::process::Stdio;

        let mut child = std::process::Command::new("git")
            .args(["check-ignore", "--stdin"])
            .current_dir(repo_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 git check-ignore 失败: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            let input = paths.join("\n");
            stdin
                .write_all(input.as_bytes())
                .map_err(|e| format!("写入 stdin 失败: {}", e))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("等待 git check-ignore 失败: {}", e))?;

        // 退出码 0 或 1 都是正常情况
        let code = output.status.code().unwrap_or(-1);
        if code != 0 && code != 1 {
            return Err(format!(
                "git check-ignore 异常退出: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let ignored: Vec<String> = stdout
            .lines()
            .map(|s| s.trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(ignored)
    }
}
