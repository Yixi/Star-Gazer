/**
 * 添加项目按钮 - 调用 Tauri dialog 插件选择文件夹
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
