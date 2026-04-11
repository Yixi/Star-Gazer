/**
 * Agent Picker - 创建新 Agent 的弹窗
 * 选择 agent 类型、项目、是否在 worktree 中启动
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { X, Terminal, Code, Cpu, Settings } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";
import { getNextColor } from "@/lib/colors";
import type { Agent, AgentType } from "@/types/agent";

interface AgentPickerProps {
  onClose: () => void;
}

/** Agent 类型定义 */
const AGENT_TYPES = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic 的 AI 编码助手",
    icon: Terminal,
    color: "#4a9eff",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "开源 AI 编码工具",
    icon: Code,
    color: "#22c55e",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI 的代码模型",
    icon: Cpu,
    color: "#a78bfa",
  },
  {
    id: "custom",
    name: "Custom",
    description: "自定义 Agent 配置",
    icon: Settings,
    color: "#ff8c42",
  },
] as const;

export function AgentPicker({ onClose }: AgentPickerProps) {
  const [selectedType, setSelectedType] = useState<string>("claude-code");
  const [agentName, setAgentName] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const { agents, addAgent } = useCanvasStore();
  const { projects, activeProject } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState(
    activeProject?.id ?? ""
  );
  const overlayRef = useRef<HTMLDivElement>(null);

  // Esc 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /** 创建 Agent */
  const handleCreate = useCallback(() => {
    const usedColors = agents.map((a) => a.color);
    const color = getNextColor(usedColors);
    const project = projects.find((p) => p.id === selectedProjectId);
    const type = AGENT_TYPES.find((t) => t.id === selectedType);

    const name =
      agentName.trim() ||
      `${type?.name ?? "Agent"} #${agents.length + 1}`;

    const agent: Agent = {
      id: crypto.randomUUID(),
      name,
      color,
      agentType: selectedType as AgentType,
      terminalId: crypto.randomUUID(),
      status: "idle",
      position: {
        x: 100 + agents.length * 40,
        y: 100 + agents.length * 40,
      },
      size: { width: 480, height: 360 },
      cwd: project?.path ?? "/tmp",
    };

    addAgent(agent);
    onClose();
  }, [
    agents,
    agentName,
    selectedType,
    selectedProjectId,
    projects,
    addAgent,
    onClose,
  ]);

  /** 点击遮罩层关闭 */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={handleOverlayClick}
    >
      <div
        className="w-[420px] rounded-xl overflow-hidden"
        style={{
          background: "#161820",
          border: "1px solid #1f2128",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ background: "#1a1d26", borderBottom: "1px solid #1f2128" }}
        >
          <h2 className="text-sm font-semibold text-white">创建新 Agent</h2>
          <button
            className="p-1 rounded-md hover:bg-white/10 text-[#6b7280] hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-5">
          {/* Agent 类型选择 */}
          <div>
            <label className="block text-xs text-[#8b92a3] font-medium mb-2 uppercase tracking-wider">
              Agent 类型
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AGENT_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType === type.id;
                return (
                  <button
                    key={type.id}
                    className={`flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      isSelected
                        ? "bg-white/10 ring-1 ring-[#4a9eff]"
                        : "bg-white/5 hover:bg-white/8"
                    }`}
                    onClick={() => setSelectedType(type.id)}
                  >
                    <Icon
                      className="w-5 h-5 flex-shrink-0"
                      style={{ color: type.color }}
                    />
                    <div>
                      <div className="text-xs font-medium text-white">
                        {type.name}
                      </div>
                      <div className="text-[10px] text-[#6b7280] mt-0.5">
                        {type.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent 名称 */}
          <div>
            <label className="block text-xs text-[#8b92a3] font-medium mb-2 uppercase tracking-wider">
              名称（可选）
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder={`${AGENT_TYPES.find((t) => t.id === selectedType)?.name ?? "Agent"} #${agents.length + 1}`}
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-[#4a5263] outline-none focus:ring-1 focus:ring-[#4a9eff] transition-colors"
              style={{
                background: "#0d0f14",
                border: "1px solid #1f2128",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>

          {/* 项目选择 */}
          <div>
            <label className="block text-xs text-[#8b92a3] font-medium mb-2 uppercase tracking-wider">
              项目
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none focus:ring-1 focus:ring-[#4a9eff] transition-colors appearance-none"
              style={{
                background: "#0d0f14",
                border: "1px solid #1f2128",
              }}
            >
              <option value="">选择项目...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Worktree 选项 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => setUseWorktree(e.target.checked)}
              className="w-4 h-4 rounded accent-[#4a9eff]"
            />
            <div>
              <div className="text-xs text-white font-medium">
                在 Git Worktree 中启动
              </div>
              <div className="text-[10px] text-[#6b7280] mt-0.5">
                创建隔离的工作树，避免分支冲突
              </div>
            </div>
          </label>
        </div>

        {/* 底部操作 */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4"
          style={{ borderTop: "1px solid #1f2128" }}
        >
          <button
            className="px-4 py-2 rounded-lg text-xs text-[#8b92a3] hover:text-white hover:bg-white/10 transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors"
            style={{
              background: "linear-gradient(135deg, #4a9eff 0%, #3b82f6 100%)",
            }}
            onClick={handleCreate}
          >
            创建 Agent
          </button>
        </div>
      </div>
    </div>
  );
}
