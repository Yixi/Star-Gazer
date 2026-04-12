/**
 * 全局视图切换条 — 24px 高度
 *
 * 左侧：Files / Changes / History 三个图标按钮（互斥）
 * 右侧：tree/flat 排版切换（仅 Changes/History 模式显示）
 *
 * 状态全局共享 — 所有项目同时切换到相同模式，避免逐项目点击。
 * 渲染位置：Sidebar 顶部（PROJECTS 标题栏下方），每次只有一份
 */
import { Files, GitCompare, History, LayoutList, FolderTree } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";

export function ScopeSwitcher() {
  const mode = useProjectStore((s) => s.viewMode);
  const flat = useProjectStore((s) => s.flatMode);
  const setViewMode = useProjectStore((s) => s.setViewMode);
  const setFlatMode = useProjectStore((s) => s.setFlatMode);

  const showFlat = mode !== "files";

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 select-none"
      style={{
        height: 28,
        padding: "0 10px 0 14px",
        borderBottom: "1px solid #161820",
        background: "#0b0c11",
        gap: 4,
      }}
    >
      {/* 左：三视图切换 */}
      <div className="flex items-center" style={{ gap: 2 }}>
        <ScopeButton
          icon={<Files className="w-3 h-3" />}
          active={mode === "files"}
          onClick={() => setViewMode("files")}
          title="Files — 完整文件树"
        />
        <ScopeButton
          icon={<GitCompare className="w-3 h-3" />}
          active={mode === "changes"}
          onClick={() => setViewMode("changes")}
          title="Changes — 仅显示未提交的变更"
        />
        <ScopeButton
          icon={<History className="w-3 h-3" />}
          active={mode === "history"}
          onClick={() => setViewMode("history")}
          title="History — 浏览 commit 历史"
        />
      </div>

      {/* 右：tree/flat 切换 */}
      {showFlat && (
        <div className="flex items-center" style={{ gap: 2 }}>
          <ScopeButton
            icon={<FolderTree className="w-3 h-3" />}
            active={!flat}
            onClick={() => setFlatMode(false)}
            title="Tree — 按目录树展示"
            small
          />
          <ScopeButton
            icon={<LayoutList className="w-3 h-3" />}
            active={flat}
            onClick={() => setFlatMode(true)}
            title="Flat — 拍平列表"
            small
          />
        </div>
      )}
    </div>
  );
}

function ScopeButton({
  icon,
  active,
  onClick,
  title,
  small,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center transition-colors"
      style={{
        width: small ? 18 : 20,
        height: 18,
        borderRadius: 3,
        backgroundColor: active ? "rgba(74, 158, 255, 0.12)" : "transparent",
        color: active ? "#4a9eff" : "#6b7280",
      }}
    >
      {icon}
    </button>
  );
}
