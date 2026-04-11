/**
 * 左侧边栏 - 项目管理和文件树
 * 宽度 240px，包含项目列表和文件树浏览器
 */
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { FileTree } from "./FileTree";
import { ProjectItem } from "./ProjectItem";

export function Sidebar() {
  const { sidebarWidth, sidebarOpen } = useSettingsStore();
  const { projects, activeProject } = useProjectStore();

  if (!sidebarOpen) return null;

  return (
    <aside
      className="flex flex-col border-r border-border bg-sidebar-background h-full"
      style={{ width: sidebarWidth }}
    >
      {/* 项目列表区域 */}
      <div className="flex-shrink-0 border-b border-border p-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
          项目
        </h2>
        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isActive={activeProject?.id === project.id}
          />
        ))}
      </div>

      {/* 文件树区域 */}
      <div className="flex-1 overflow-hidden">
        {activeProject ? (
          <FileTree />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            请选择或添加项目
          </div>
        )}
      </div>
    </aside>
  );
}
