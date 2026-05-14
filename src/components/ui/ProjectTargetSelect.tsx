/**
 * 项目 / 项目组 选择器
 *
 * 用 Base UI 的 Select 原语重写，替代原生 `<select>` —— 原生 select 无法
 * 自定义 option 渲染（图标 / 缩进层级 / 多行描述都做不到）且 optgroup 样式
 * 几乎不能控制。
 *
 * 层级：
 *   - 独立项目（顶层分组，无标签）
 *   - 每个 ProjectGroup 为一个 group：
 *     - 第一项："整个组 · N 个仓库" → value = `g-{id}`
 *     - 缩进成员 → value = `p-{memberId}`
 *
 * 调用方通过 `value` (带 `g-` / `p-` 前缀) 和 `onChange` 交互。
 */
import { useMemo } from "react";
import { Select } from "@base-ui/react/select";
import { ChevronDown, FolderGit2, Folders, Check } from "lucide-react";
import type { Project, ProjectGroup } from "@/types/project";

interface ProjectTargetSelectProps {
  projects: Project[];
  projectGroups: ProjectGroup[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface SelectedInfo {
  kind: "project" | "group";
  name: string;
  detail?: string;
}

function describeSelection(
  value: string,
  projects: Project[],
  projectGroups: ProjectGroup[],
): SelectedInfo | null {
  if (!value) return null;
  if (value.startsWith("g-")) {
    const g = projectGroups.find((x) => x.id === value.slice(2));
    if (!g) return null;
    const count = projects.filter((p) => p.groupId === g.id).length;
    return { kind: "group", name: g.name, detail: `${count} 个仓库` };
  }
  if (value.startsWith("p-")) {
    const p = projects.find((x) => x.id === value.slice(2));
    if (!p) return null;
    const parentGroup = p.groupId
      ? projectGroups.find((g) => g.id === p.groupId)
      : null;
    return {
      kind: "project",
      name: p.name,
      detail: parentGroup ? `组: ${parentGroup.name}` : undefined,
    };
  }
  return null;
}

export function ProjectTargetSelect({
  projects,
  projectGroups,
  value,
  onChange,
  placeholder = "选择项目 / 项目组...",
}: ProjectTargetSelectProps) {
  const standaloneProjects = useMemo(
    () => projects.filter((p) => !p.groupId),
    [projects],
  );

  const groupedMembers = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const g of projectGroups) {
      map.set(
        g.id,
        projects.filter((p) => p.groupId === g.id),
      );
    }
    return map;
  }, [projectGroups, projects]);

  const selected = describeSelection(value, projects, projectGroups);

  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as string)}>
      <Select.Trigger
        className="w-full px-3 py-2 rounded-lg text-sm text-white flex items-center gap-2 outline-none transition-colors"
        style={{
          background: "var(--sg-bg-code)",
          border: "1px solid var(--sg-border-secondary)",
        }}
      >
        <span className="flex-1 flex items-center gap-2 min-w-0 text-left">
          {selected ? (
            <>
              {selected.kind === "group" ? (
                <Folders
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#4a9eff" }}
                />
              ) : (
                <FolderGit2
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#8b92a3" }}
                />
              )}
              <span className="truncate" style={{ color: "#e4e6eb" }}>
                {selected.name}
              </span>
              {selected.detail && (
                <span
                  className="truncate"
                  style={{ color: "#6b7280", fontSize: 11 }}
                >
                  · {selected.detail}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "#4a5263" }}>{placeholder}</span>
          )}
        </span>
        <Select.Icon render={<ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "#8b92a3" }} />} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="outline-none"
          // z-index 必须高于 AgentPicker 模态（z-50）和最大化卡片（z-999）
          // —— Base UI 默认不设 z-index，会被任何带 z-index 的祖先盖住
          style={{ zIndex: 1000 }}
        >
          <Select.Popup
            className="rounded-lg shadow-2xl py-1 max-h-[360px] overflow-y-auto"
            style={{
              background: "var(--sg-bg-card)",
              border: "1px solid var(--sg-border-divider)",
              minWidth: "var(--anchor-width, 320px)",
            }}
            /*
              Portal 出去的 Popup 在 React 事件树上仍会冒泡到 Canvas，
              而 Canvas 的 onWheel 会 preventDefault + 平移视口。
              这里 stopPropagation 阻断 wheel 上传，下拉滚动时背后画布静止。
            */
            onWheel={(e) => e.stopPropagation()}
          >
            {standaloneProjects.length > 0 && (
              <Select.Group>
                <Select.GroupLabel
                  className="block px-3 pt-2 pb-1 uppercase tracking-wider"
                  style={{
                    fontSize: 10,
                    color: "#6b7280",
                    letterSpacing: "0.6px",
                  }}
                >
                  独立项目
                </Select.GroupLabel>
                {standaloneProjects.map((p) => (
                  <Item
                    key={`p-${p.id}`}
                    value={`p-${p.id}`}
                    icon={
                      <FolderGit2
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: "#8b92a3" }}
                      />
                    }
                    label={p.name}
                  />
                ))}
              </Select.Group>
            )}

            {projectGroups.map((g) => {
              const members = groupedMembers.get(g.id) ?? [];
              return (
                <Select.Group key={g.id}>
                  <Select.GroupLabel
                    className="flex items-center gap-1.5 px-3 pt-2 pb-1 uppercase tracking-wider"
                    style={{
                      fontSize: 10,
                      color: "#6b7280",
                      letterSpacing: "0.6px",
                    }}
                  >
                    <Folders
                      className="w-3 h-3 flex-shrink-0"
                      style={{ color: "#4a9eff" }}
                    />
                    <span className="truncate">{g.name}</span>
                  </Select.GroupLabel>
                  <Item
                    value={`g-${g.id}`}
                    icon={
                      <Folders
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: "#4a9eff" }}
                      />
                    }
                    label="整个组"
                    detail={`${members.length} 个仓库`}
                  />
                  {members.map((m) => (
                    <Item
                      key={`p-${m.id}`}
                      value={`p-${m.id}`}
                      indent
                      icon={
                        <FolderGit2
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: "#8b92a3" }}
                        />
                      }
                      label={m.name}
                    />
                  ))}
                </Select.Group>
              );
            })}

            {standaloneProjects.length === 0 && projectGroups.length === 0 && (
              <div
                className="px-3 py-4 text-center"
                style={{ color: "#6b7280", fontSize: 12 }}
              >
                还没有任何项目
              </div>
            )}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/**
 * 单个 Select.Item，自带 hover / 高亮 / 选中指示。
 * Base UI 在 highlighted item 上加 `data-highlighted`，选中的加 `data-selected`。
 */
function Item({
  value,
  icon,
  label,
  detail,
  indent,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
  detail?: string;
  indent?: boolean;
}) {
  return (
    <Select.Item
      value={value}
      className="flex items-center gap-2 text-sm cursor-pointer outline-none transition-colors data-[highlighted]:bg-[#242731] data-[selected]:bg-[#2a3246]"
      style={{
        color: "#e4e6eb",
        padding: `6px 10px 6px ${indent ? 28 : 12}px`,
      }}
    >
      {icon}
      <Select.ItemText className="flex-1 truncate">{label}</Select.ItemText>
      {detail && (
        <span
          className="tabular-nums flex-shrink-0"
          style={{ color: "#6b7280", fontSize: 10 }}
        >
          {detail}
        </span>
      )}
      <Select.ItemIndicator
        className="flex-shrink-0"
        render={<Check className="w-3.5 h-3.5" style={{ color: "#4a9eff" }} />}
      />
    </Select.Item>
  );
}
