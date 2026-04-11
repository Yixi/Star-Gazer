/**
 * 命令面板 - 基于 cmdk 的全局命令搜索
 * 快捷键 Cmd+K 唤起
 */
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import {
  Plus,
  FolderOpen,
  Settings,
  Search,
  GitBranch,
  Terminal,
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  // 监听 Cmd+K 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setOpen(false)}
      />

      {/* 命令面板 */}
      <Command
        className="relative w-[540px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Command.Input
            className="flex-1 h-11 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="输入命令..."
          />
        </div>

        <Command.List className="max-h-[300px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            没有找到匹配的命令
          </Command.Empty>

          <Command.Group
            heading="Agent"
            className="text-xs text-muted-foreground px-2 py-1"
          >
            <Command.Item
              className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer data-[selected]:bg-accent data-[selected]:text-accent-foreground"
              onSelect={() => {
                // TODO: 创建新 Agent
                setOpen(false);
              }}
            >
              <Plus className="w-4 h-4" />
              新建 Agent
            </Command.Item>
            <Command.Item className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer data-[selected]:bg-accent data-[selected]:text-accent-foreground">
              <Terminal className="w-4 h-4" />
              新建终端
            </Command.Item>
          </Command.Group>

          <Command.Group
            heading="项目"
            className="text-xs text-muted-foreground px-2 py-1"
          >
            <Command.Item className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer data-[selected]:bg-accent data-[selected]:text-accent-foreground">
              <FolderOpen className="w-4 h-4" />
              打开项目
            </Command.Item>
            <Command.Item className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer data-[selected]:bg-accent data-[selected]:text-accent-foreground">
              <GitBranch className="w-4 h-4" />
              切换分支
            </Command.Item>
          </Command.Group>

          <Command.Group
            heading="设置"
            className="text-xs text-muted-foreground px-2 py-1"
          >
            <Command.Item className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer data-[selected]:bg-accent data-[selected]:text-accent-foreground">
              <Settings className="w-4 h-4" />
              打开设置
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
