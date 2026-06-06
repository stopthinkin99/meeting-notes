"use client";

import { ActionItem } from "@/types";
import { Button, Input, SectionLabel } from "@/components/ui";
import { Trash2, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionItemsProps {
  items: ActionItem[];
  onUpdate: (id: string, patch: Partial<ActionItem>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function ActionItems({ items, onUpdate, onDelete, onAdd }: ActionItemsProps) {
  const done = items.filter((i) => i.done).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SectionLabel>Action items</SectionLabel>
          {items.length > 0 && (
            <span className="text-xs text-gray-400 -mt-3">
              {done}/{items.length} done
            </span>
          )}
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mb-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${items.length > 0 ? (done / items.length) * 100 : 0}%` }}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 py-8 text-center">
          <p className="text-sm text-gray-400">No action items yet</p>
          <Button size="sm" className="mt-3" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> Add action item
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-[24px_1fr_36px_160px_120px_36px] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <span />
            <span>Task</span>
            <span />
            <span>Owner</span>
            <span>Due date</span>
            <span />
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-[24px_1fr_36px_160px_120px_36px] gap-2 items-center rounded-lg border px-3 py-2.5 transition-colors group",
                item.done
                  ? "bg-gray-50 border-gray-100 dark:bg-gray-800/40 dark:border-gray-800"
                  : "bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700"
              )}
            >
              {/* Checkbox */}
              <button
                onClick={() => onUpdate(item.id, { done: !item.done })}
                className={cn(
                  "h-5 w-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                  item.done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-gray-300 hover:border-gray-400 dark:border-gray-600"
                )}
              >
                {item.done && <Check className="h-3 w-3 stroke-[3]" />}
              </button>

              {/* Task */}
              <Input
                value={item.task}
                onChange={(e) => onUpdate(item.id, { task: e.target.value })}
                placeholder="Describe the action..."
                className={cn(
                  "border-transparent bg-transparent px-0 text-sm h-auto py-0 focus:bg-transparent focus:ring-0 focus:border-transparent",
                  item.done && "line-through text-gray-400"
                )}
              />

              {/* Spacer */}
              <span />

              {/* Owner */}
              <Input
                value={item.owner}
                onChange={(e) => onUpdate(item.id, { owner: e.target.value })}
                placeholder="Owner..."
                className="text-sm h-7 px-2 py-1"
              />

              {/* Due date */}
              <Input
                value={item.dueDate}
                onChange={(e) => onUpdate(item.id, { dueDate: e.target.value })}
                placeholder="e.g. End of month"
                className="text-sm h-7 px-2 py-1"
              />

              {/* Delete */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(item.id)}
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
