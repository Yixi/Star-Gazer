/**
 * 项目列表项组件
 */
import { Folder } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import type { Project } from "@/types/project";

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
}

export function ProjectItem({ project, isActive }: ProjectItemProps) {
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  return (
    <button
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-sidebar-foreground hover:bg-accent/50"
      }`}
      onClick={() => setActiveProject(project)}
    >
      <Folder className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{project.name}</span>
    </button>
  );
}
