/**
 * 添加项目按钮 - 调用 Tauri dialog 插件选择文件夹
 * 选择后同时持久化到后端（add_project 命令）并更新前端 store
 */
import { Plus } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";

interface AddProjectButtonProps {
  collapsed?: boolean;
}

export function AddProjectButton({ collapsed }: AddProjectButtonProps) {
  const addProject = useProjectStore((s) => s.addProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const handleAddProject = async () => {
    try {
      // 动态导入 Tauri dialog 插件
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });

      if (selected && typeof selected === "string") {
        // 调用后端持久化项目
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const project = await invoke<{
            id: string;
            name: string;
            path: string;
            lastOpened: number;
          }>("add_project", { path: selected });
          addProject(project);
          setActiveProject(project);
        } catch (backendErr) {
          // 后端调用失败时回退到前端创建
          console.warn("Backend add_project failed, creating locally:", backendErr);
          const name = selected.split("/").pop() || selected;
          const project = {
            id: `project-${Date.now()}`,
            name,
            path: selected,
            lastOpened: Date.now(),
          };
          addProject(project);
          setActiveProject(project);
        }
      }
    } catch (err) {
      // 在非 Tauri 环境下（开发时）使用 mock
      console.warn("Tauri dialog not available, using mock:", err);
      const mockPath = `/Users/demo/project-${Date.now()}`;
      const project = {
        id: `project-${Date.now()}`,
        name: `demo-project`,
        path: mockPath,
        lastOpened: Date.now(),
      };
      addProject(project);
      setActiveProject(project);
    }
  };

  if (collapsed) {
    return (
      <button
        className="p-2 rounded-md hover:bg-white/5 transition-colors mt-auto"
        style={{ color: "#8b92a3" }}
        onClick={handleAddProject}
        title="添加项目"
      >
        <Plus className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      className="p-1 rounded-md hover:bg-white/10 transition-colors"
      style={{ color: "#8b92a3" }}
      onClick={handleAddProject}
      title="添加项目"
    >
      <Plus className="w-4 h-4" />
    </button>
  );
}
