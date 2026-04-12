/**
 * 项目内视图切换条 — 24px 高度
 *
 * 左侧：Files / Changes / History 三个图标按钮（互斥）
 * 右侧：tree/flat 排版切换（仅 Changes/History 模式显示）
 *
 * 交互约束：在 240px 侧边栏里，整个切换条一行显示完
 */
import { Files, GitCompare, History, LayoutList, FolderTree } from "lucide-react";
import { useProjectStore, type SidebarViewMode } from "@/stores/projectStore";
import type { Project } from "@/types/project";

interface ScopeSwitcherProps {
  project: Project;
}

export function ScopeSwitcher({ project }: ScopeSwitcherProps) {
  const mode = useProjectStore((s) => s.viewModes[project.id] ?? "files");
  const flat = useProjectStore((s) => s.flatModes[project.id] ?? false);
  const setViewMode = useProjectStore((s) => s.setViewMode);
  const setFlatMode = useProjectStore((s) => s.setFlatMode);

  const showFlat = mode !== "files";

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 select-none"
      style={{
        height: 24,
        padding: "0 10px 0 14px",
        borderBottom: "1px solid #161820",
        gap: 4,
      }}
    >
      {/* 左：三视图切换 */}
      <div className="flex items-center" style={{ gap: 2 }}>
        <ScopeButton
          icon={<Files className="w-3 h-3" />}
          active={mode === "files"}
          onClick={() => setViewMode(project.id, "files")}
          title="Files — 完整文件树"
        />
        <ScopeButton
          icon={<GitCompare className="w-3 h-3" />}
          active={mode === "changes"}
          onClick={() => setViewMode(project.id, "changes")}
          title="Changes — 仅显示未提交的变更"
        />
        <ScopeButton
          icon={<History className="w-3 h-3" />}
          active={mode === "history"}
          onClick={() => setViewMode(project.id, "history")}
          title="History — 浏览 commit 历史"
        />
      </div>

      {/* 右：tree/flat 切换 */}
      {showFlat && (
        <div className="flex items-center" style={{ gap: 2 }}>
          <ScopeButton
            icon={<FolderTree className="w-3 h-3" />}
            active={!flat}
            onClick={() => setFlatMode(project.id, false)}
            title="Tree — 按目录树展示"
            small
          />
          <ScopeButton
            icon={<LayoutList className="w-3 h-3" />}
            active={flat}
            onClick={() => setFlatMode(project.id, true)}
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
  const dispatchMode = (mode: SidebarViewMode) => () => mode;
  void dispatchMode; // keep types happy
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
