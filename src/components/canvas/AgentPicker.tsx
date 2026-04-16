/**
 * Agent Picker - 创建新 Agent 的弹窗
 * 选择 agent 类型、项目，对 claude-code 可切换 bypass permission 模式
 */
import { useState, useCallback, useEffect, useRef, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { X, Terminal } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { getNextColor } from "@/lib/colors";
import type { Agent, AgentType } from "@/types/agent";
import { ClaudeLogo, CodexLogo, OpenCodeLogo } from "./AgentLogos";
import { ProjectTargetSelect } from "@/components/ui/ProjectTargetSelect";

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
    description: "agent.claudeCodeDesc",
    Icon: ClaudeLogo,
    color: "#d97757",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "agent.openCodeDesc",
    Icon: OpenCodeLogo,
    color: "#22c55e",
  },
  {
    id: "codex",
    name: "Codex",
    description: "agent.codexDesc",
    Icon: CodexLogo,
    color: "#a78bfa",
  },
  {
    id: "custom",
    name: "Custom",
    description: "agent.customDesc",
    Icon: Terminal,
    color: "#ff8c42",
  },
];

export function AgentPicker({ onClose, initialType }: AgentPickerProps) {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<AgentType>(initialType ?? "claude-code");
  const [agentName, setAgentName] = useState("");
  const [bypassPermissions, setBypassPermissions] = useState(false);
  const { agents, addAgent } = useCanvasStore();
  const { projects, activeProject } = useProjectStore();
  const projectGroups = useProjectStore((s) => s.projectGroups);
  const lastAgentProjectId = useSettingsStore((s) => s.lastAgentProjectId);
  const setLastAgentProjectId = useSettingsStore((s) => s.setLastAgentProjectId);

  /**
   * 目标 key 格式：
   *   - `p-{projectId}`  → 独立项目 或 组成员
   *   - `g-{groupId}`    → 整个项目组
   *
   * 之所以用前缀区分而不是直接 id，是因为要让"组 X"和"项目 X"同时存在于同一个
   * 下拉列表里并各自被选中。存 settingsStore.lastAgentProjectId 时也带前缀，
   * 向后兼容旧值（无前缀时按独立项目处理）。
   */
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>(() => {
    // 优先级：上次记忆 → 当前活跃项目（所属组或自身）→ 第一个独立项目 → 空
    if (lastAgentProjectId) {
      // 带前缀或不带前缀都兼容
      if (lastAgentProjectId.startsWith("g-")) {
        const gid = lastAgentProjectId.slice(2);
        if (projectGroups.some((g) => g.id === gid)) return lastAgentProjectId;
      } else if (lastAgentProjectId.startsWith("p-")) {
        const pid = lastAgentProjectId.slice(2);
        if (projects.some((p) => p.id === pid)) return lastAgentProjectId;
      } else if (projects.some((p) => p.id === lastAgentProjectId)) {
        // 旧格式：纯 project id
        return `p-${lastAgentProjectId}`;
      }
    }
    if (activeProject) {
      // 活跃项目所属组优先
      if (activeProject.groupId) {
        return `g-${activeProject.groupId}`;
      }
      return `p-${activeProject.id}`;
    }
    return "";
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
    const type = AGENT_TYPES.find((t) => t.id === selectedType);

    const name =
      agentName.trim() ||
      `${type?.name ?? "Agent"} #${agents.length + 1}`;

    // 从 selectedTargetKey 解出 cwd + scope
    let cwd = "/tmp";
    let scope: Agent["scope"] = undefined;
    if (selectedTargetKey.startsWith("g-")) {
      const gid = selectedTargetKey.slice(2);
      const group = projectGroups.find((g) => g.id === gid);
      if (group) {
        cwd = group.path;
        scope = { kind: "group", groupId: gid };
      }
    } else if (selectedTargetKey.startsWith("p-")) {
      const pid = selectedTargetKey.slice(2);
      const project = projects.find((p) => p.id === pid);
      if (project) {
        cwd = project.path;
        scope = { kind: "project", projectId: pid };
      }
    }

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
      cwd,
      ...(scope ? { scope } : {}),
      ...(command ? { command } : {}),
    };

    addAgent(agent);
    // 记住这次选的目标（带前缀），下次打开 picker 作为默认
    setLastAgentProjectId(selectedTargetKey || null);
    onClose();
  }, [
    agents,
    agentName,
    selectedType,
    selectedTargetKey,
    bypassPermissions,
    projects,
    projectGroups,
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
          <h2 className="text-sm font-semibold text-white">{t("agent.createNew")}</h2>
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
              {t("agent.agentType")}
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
                        {t(type.description)}
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
              {t("agent.nameOptional")}
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

          {/* 项目 / 组选择 —— 用 Base UI Select 自定义渲染层级 */}
          <div>
            <label className="block text-xs text-[#8b92a3] font-medium mb-2 uppercase tracking-wider">
              {t("project.title")}
            </label>
            <ProjectTargetSelect
              projects={projects}
              projectGroups={projectGroups}
              value={selectedTargetKey}
              onChange={setSelectedTargetKey}
            />
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
            {t("common.cancel")}
          </button>
          <button
            className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors"
            style={{
              background: "linear-gradient(135deg, #4a9eff 0%, #3b82f6 100%)",
            }}
            onClick={handleCreate}
          >
            {t("agent.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
