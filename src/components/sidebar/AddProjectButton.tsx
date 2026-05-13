/**
 * 添加项目按钮
 *
 * 流程：选目录 → 后端 scan_git_repos 智能分流
 *   - Single：目录本身是 git 仓库 → 直接作为独立项目添加
 *   - Group：父目录下有若干 git 仓库 → 弹 ImportGroupDialog 让用户确认
 *   - Empty：既不是 git 也没子仓库 → 降级为"单目录"添加 + 提示
 *
 * 持久化由 workspace autosave 负责。
 */
import { Plus } from "lucide-react";
import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import * as workspaceService from "@/services/workspace";
import { ImportGroupDialog } from "./ImportGroupDialog";
import type { Project, ProjectGroup } from "@/types/project";

interface AddProjectButtonProps {
  collapsed?: boolean;
}

interface PendingGroup {
  parentPath: string;
  parentName: string;
  members: Array<{ name: string; path: string }>;
}

/** 生成稳定 id：优先 crypto.randomUUID，降级到时间戳 */
function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function basenameOf(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function AddProjectButton({ collapsed }: AddProjectButtonProps) {
  const addProject = useProjectStore((s) => s.addProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const addProjectGroup = useProjectStore((s) => s.addProjectGroup);

  const [pendingGroup, setPendingGroup] = useState<PendingGroup | null>(null);

  const importAsSingle = (path: string, name?: string) => {
    const project: Project = {
      id: newId("project"),
      name: name ?? basenameOf(path),
      path,
      lastOpened: Date.now(),
    };
    addProject(project);
    setActiveProject(project);
  };

  const importAsGroup = async (
    g: PendingGroup,
    selectedMembers: Array<{ name: string; path: string }>,
  ) => {
    const group: ProjectGroup = {
      id: newId("group"),
      name: g.parentName,
      path: g.parentPath,
    };
    const members: Array<Omit<Project, "groupId">> = selectedMembers.map(
      (m) => ({
        id: newId("project"),
        name: m.name,
        path: m.path,
        lastOpened: Date.now(),
      }),
    );
    // 必须 await —— 否则沙箱 sync 还在路上，FileTree 的 list_dir 会被拒
    await addProjectGroup(group, members);
    // 激活第一个成员作为当前活跃项目
    if (members.length > 0) {
      setActiveProject({ ...members[0], groupId: group.id });
    }
  };

  const handleAddProject = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });

      if (!selected || typeof selected !== "string") return;

      // 调后端智能扫描
      let scan: workspaceService.ScanGitReposResult;
      try {
        scan = await workspaceService.scanGitRepos(selected);
      } catch (err) {
        console.warn("scanGitRepos failed, fallback to single project:", err);
        importAsSingle(selected);
        return;
      }

      if (scan.kind === "single") {
        importAsSingle(scan.path, scan.name);
        return;
      }

      if (scan.kind === "group") {
        setPendingGroup({
          parentPath: scan.parentPath,
          parentName: scan.parentName,
          members: scan.members,
        });
        return;
      }

      // empty：目录既不是 git 也没子仓库，降级为单目录添加
      // （用户可能就是想管理一个普通目录的文件）
      importAsSingle(selected);
    } catch (err) {
      console.warn("添加项目失败:", err);
    }
  };

  const renderButton = () => {
    if (collapsed) {
      return (
        <button
          className="p-2 rounded-md transition-colors mt-auto"
          style={{ color: "var(--sg-text-tertiary)" }}
          onClick={handleAddProject}
          title="添加项目"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            e.currentTarget.style.color = "var(--sg-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--sg-text-tertiary)";
          }}
        >
          <Plus className="w-4 h-4" />
        </button>
      );
    }
    // 设计稿 sb-label .mini：18x18 圆角按钮，hint 色，hover 高亮
    return (
      <button
        className="inline-flex items-center justify-center transition-colors"
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          color: "var(--sg-text-hint)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        onClick={handleAddProject}
        title="添加项目"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
          e.currentTarget.style.color = "var(--sg-text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--sg-text-hint)";
        }}
      >
        <Plus className="w-3 h-3" />
      </button>
    );
  };

  return (
    <>
      {renderButton()}
      {pendingGroup && (
        <ImportGroupDialog
          parentPath={pendingGroup.parentPath}
          parentName={pendingGroup.parentName}
          members={pendingGroup.members}
          onClose={() => setPendingGroup(null)}
          onImportGroup={(selected) => {
            const g = pendingGroup;
            setPendingGroup(null);
            void importAsGroup(g, selected);
          }}
          onImportParentOnly={() => {
            importAsSingle(pendingGroup.parentPath, pendingGroup.parentName);
            setPendingGroup(null);
          }}
        />
      )}
    </>
  );
}
