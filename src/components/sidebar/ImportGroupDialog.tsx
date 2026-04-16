/**
 * 导入项目组的确认弹窗
 *
 * 当用户选中的目录本身不是 git 仓库，但其一层子目录里有若干 git 仓库时，
 * 弹出这个对话框让用户决定：
 *   - 勾选要加入组的成员（默认全选），确认作为项目组添加
 *   - 只添加父目录本身（作为一个独立项目，即便它不是 git 仓库）
 *   - 取消
 *
 * 复用 WorkspacePicker 的 Portal + 深色模态样式。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Folders, FolderGit2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ImportGroupDialogProps {
  parentPath: string;
  parentName: string;
  members: Array<{ name: string; path: string }>;
  /** 用户确认"作为组添加"时回调，传回用户勾选的成员子集 */
  onImportGroup: (selected: Array<{ name: string; path: string }>) => void;
  /** 用户点"只添加父目录"时回调 */
  onImportParentOnly: () => void;
  onClose: () => void;
}

export function ImportGroupDialog({
  parentPath,
  parentName,
  members,
  onImportGroup,
  onImportParentOnly,
  onClose,
}: ImportGroupDialogProps) {
  const { t } = useTranslation();
  // 默认全选
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(members.map((m) => m.path)),
  );

  const toggle = useCallback((path: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setChecked((prev) => {
      if (prev.size === members.length) return new Set();
      return new Set(members.map((m) => m.path));
    });
  }, [members]);

  const selectedMembers = useMemo(
    () => members.filter((m) => checked.has(m.path)),
    [members, checked],
  );

  const allSelected = checked.size === members.length && members.length > 0;
  const someSelected = checked.size > 0 && checked.size < members.length;

  // Esc 关闭（capture 阶段，避免被 Command Palette 的 keydown 抢）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const handleOverlay = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleOverlay}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      />

      <div
        className="relative rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          width: 560,
          maxHeight: "80vh",
          backgroundColor: "#161820",
          border: "1px solid #1f2128",
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid #1f2128" }}
        >
          <Folders className="w-5 h-5" style={{ color: "#4a9eff" }} />
          <div className="flex-1 min-w-0">
            <div
              className="font-semibold truncate"
              style={{ color: "#e4e6eb", fontSize: 14 }}
            >
              {t("importGroup.title")}
            </div>
            <div
              className="truncate"
              style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}
              title={parentPath}
            >
              {parentPath}
            </div>
          </div>
          <button
            className="p-1 rounded hover:bg-white/5"
            onClick={onClose}
            aria-label={t("common.close")}
            style={{ color: "#8b92a3" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 说明 */}
        <div
          className="px-5 pt-4 pb-2 leading-relaxed"
          style={{ color: "#b8bcc4", fontSize: 12 }}
        >
          {t("importGroup.description", { parent: parentName, count: members.length })
            .split(/<bold>|<\/bold>|<accent>|<\/accent>/)
            .map((part, i) =>
              i === 1 ? (
                <span key={i} style={{ color: "#e4e6eb", fontWeight: 600 }}>{part}</span>
              ) : i === 3 ? (
                <span key={i} style={{ color: "#4a9eff" }}>{part}</span>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
        </div>

        {/* 全选 / 反选 */}
        <div className="px-5 py-2 flex items-center gap-3">
          <button
            className="flex items-center gap-2 text-xs hover:opacity-80"
            style={{ color: "#8b92a3" }}
            onClick={toggleAll}
          >
            <CheckBox checked={allSelected} indeterminate={someSelected} />
            <span>
              {allSelected ? t("importGroup.deselectAll") : someSelected ? t("importGroup.selectRemaining") : t("importGroup.selectAll")}
            </span>
          </button>
          <span
            className="ml-auto tabular-nums"
            style={{ color: "#6b7280", fontSize: 11 }}
          >
            {t("importGroup.selected", { checked: checked.size, total: members.length })}
          </span>
        </div>

        {/* 成员列表（checkbox） */}
        <div className="px-5 pb-4 overflow-y-auto flex-1">
          <div
            className="rounded-md py-1"
            style={{
              backgroundColor: "#0b0c11",
              border: "1px solid #1f2128",
            }}
          >
            {members.map((m) => {
              const isChecked = checked.has(m.path);
              return (
                <button
                  key={m.path}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left"
                  onClick={() => toggle(m.path)}
                >
                  <CheckBox checked={isChecked} />
                  <FolderGit2
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: isChecked ? "#4a9eff" : "#8b92a3" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{
                        color: isChecked ? "#e4e6eb" : "#8b92a3",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {m.name}
                    </div>
                    <div
                      className="truncate"
                      style={{ color: "#6b7280", fontSize: 10 }}
                      title={m.path}
                    >
                      {m.path}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 按钮区 */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: "1px solid #1f2128" }}
        >
          <button
            className="px-3 py-1.5 rounded text-xs hover:bg-white/5"
            style={{ color: "#8b92a3" }}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            className="px-3 py-1.5 rounded text-xs hover:bg-white/10"
            style={{ color: "#b8bcc4", border: "1px solid #2a2d36" }}
            onClick={onImportParentOnly}
            title={t("project.addParentOnlyTooltip")}
          >
            {t("project.addParentOnly")}
          </button>
          <button
            className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40"
            style={{
              backgroundColor: "#4a9eff",
              color: "#ffffff",
            }}
            disabled={selectedMembers.length === 0}
            onClick={() => onImportGroup(selectedMembers)}
          >
            {t("project.addReposAsGroup", { count: selectedMembers.length })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CheckBox({
  checked,
  indeterminate,
}: {
  checked: boolean;
  indeterminate?: boolean;
}) {
  return (
    <span
      className="flex-shrink-0 flex items-center justify-center"
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        border: `1px solid ${checked || indeterminate ? "#4a9eff" : "#4a5263"}`,
        backgroundColor:
          checked || indeterminate ? "#4a9eff" : "transparent",
      }}
    >
      {checked && <Check className="w-3 h-3" style={{ color: "#ffffff" }} />}
      {!checked && indeterminate && (
        <span
          style={{
            width: 8,
            height: 2,
            backgroundColor: "#ffffff",
            borderRadius: 1,
          }}
        />
      )}
    </span>
  );
}
