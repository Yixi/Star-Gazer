/**
 * Agent Picker - 创建新 Agent 的弹窗
 * 选择 agent 类型、项目，对 claude-code 可切换 bypass permission 模式
 */
import { useState, useCallback, useEffect, useRef, type ComponentType } from "react";
import { X, Terminal } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { getNextColor } from "@/lib/colors";
import type { Agent, AgentType } from "@/types/agent";
import { ClaudeLogo, CodexLogo, OpenCodeLogo } from "./AgentLogos";

interface AgentPickerProps {
  onClose: () => void;
  /** 预设初始 Agent 类型，例如从命令面板"新建终端"带入 "custom" */
  initialType?: AgentType;
}

/** Agent 类型卡片配置 */
interface AgentTypeSpec {
  id: AgentType;
  name: string;
  description: string;
  Icon: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
}

const AGENT_TYPES: readonly AgentTypeSpec[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic 的 AI 编码助手",
    Icon: ClaudeLogo,
    color: "#d97757",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "开源 AI 编码工具",
    Icon: OpenCodeLogo,
    color: "#22c55e",
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI 的代码模型",
    Icon: CodexLogo,
    color: "#a78bfa",
  },
  {
    id: "custom",
    name: "Custom",
    description: "自定义 / 默认 shell",
    Icon: Terminal,
    color: "#ff8c42",
  },
];

export function AgentPicker({ onClose, initialType }: AgentPickerProps) {
  const [selectedType, setSelectedType] = useState<AgentType>(initialType ?? "claude-code");
  const [agentName, setAgentName] = useState("");
  const [bypassPermissions, setBypassPermissions] = useState(false);
  const { agents, addAgent } = useCanvasStore();
  const { projects, activeProject } = useProjectStore();
  const lastAgentProjectId = useSettingsStore((s) => s.lastAgentProjectId);
  const setLastAgentProjectId = useSettingsStore((s) => s.setLastAgentProjectId);

  // 初始项目优先级：上次记忆 → 当前激活项目 → 空
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    if (lastAgentProjectId && projects.some((p) => p.id === lastAgentProjectId)) {
      return lastAgentProjectId;
    }
    return activeProject?.id ?? "";
  });
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

    // claude-code + bypass → 覆盖启动命令带上 --dangerously-skip-permissions
    // agentType 仍是 "claude-code"（保留色盘/图标），但 agent.command 会被
    // AgentCard.terminalCommand 优先读取
    const command =
      selectedType === "claude-code" && bypassPermissions
        ? "claude --dangerously-skip-permissions"
        : undefined;

    const agent: Agent = {
      id: crypto.randomUUID(),
      name,
      color,
      agentType: selectedType,
      terminalId: crypto.randomUUID(),
      status: "idle",
      position: {
        x: 100 + agents.length * 40,
        y: 100 + agents.length * 40,
      },
      size: { width: 680, height: 480 },
      cwd: project?.path ?? "/tmp",
      ...(command ? { command } : {}),
    };

    addAgent(agent);
    // 记住这次选的项目，下次打开 picker 作为默认
    setLastAgentProjectId(selectedProjectId || null);
    onClose();
  }, [
    agents,
    agentName,
    selectedType,
    selectedProjectId,
    bypassPermissions,
    projects,
    addAgent,
    setLastAgentProjectId,
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
                const Icon = type.Icon;
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
                      size={20}
                      className="flex-shrink-0"
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

          {/* Claude Code 专属：bypass permission 开关 */}
          {selectedType === "claude-code" && (
            <label
              className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors bg-white/5 hover:bg-white/[0.07]"
            >
              <button
                type="button"
                role="switch"
                aria-checked={bypassPermissions}
                onClick={() => setBypassPermissions((v) => !v)}
                className={`relative flex-shrink-0 mt-0.5 w-8 h-[18px] rounded-full transition-colors ${
                  bypassPermissions ? "bg-[#4a9eff]" : "bg-[#2a2d36]"
                }`}
              >
                <span
                  className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform"
                  style={{
                    transform: bypassPermissions
                      ? "translateX(14px)"
                      : "translateX(0)",
                  }}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white">
                  Bypass Permissions
                </div>
                <div className="text-[10px] text-[#6b7280] mt-0.5 leading-relaxed">
                  启动时追加 <code className="text-[#e4e6eb] bg-black/30 px-1 rounded">--dangerously-skip-permissions</code>，Claude Code 不再逐步询问。
                </div>
              </div>
            </label>
          )}

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
