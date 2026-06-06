"use client";

import { MoMRow } from "@/types";
import { Button, Select, Textarea, SectionLabel } from "@/components/ui";
import { Trash2, ChevronUp, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MoMTableProps {
  rows: MoMRow[];
  onUpdate: (id: string, patch: Partial<MoMRow>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onAdd: () => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400",
  Medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400",
  Low: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400",
  "": "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_STYLES: Record<string, string> = {
  Open: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  "In Progress": "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  Done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  "": "bg-gray-50 text-gray-500 dark:bg-gray-800",
};

export function MoMTable({ rows, onUpdate, onDelete, onMove, onAdd }: MoMTableProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Minutes of meeting</SectionLabel>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add row
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 py-10 text-center">
          <p className="text-sm text-gray-400">No points yet — generate from recording or add manually</p>
          <Button size="sm" className="mt-3" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> Add first row
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700 w-8">#</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700">Points discussed</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700 w-36">Contact person</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700 w-40">Dependency</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700 w-24">Priority</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 dark:border-gray-700 w-28">Status</th>
                <th className="border-b border-gray-200 dark:border-gray-700 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className="group align-top hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  {/* # */}
                  <td className="px-3 py-3 text-gray-400 font-medium text-sm w-8">
                    {row.pointNumber}
                  </td>

                  {/* Points discussed */}
                  <td className="px-1 py-1">
                    <Textarea
                      value={row.pointsDiscussed}
                      onChange={(e) => onUpdate(row.id, { pointsDiscussed: e.target.value })}
                      className="min-h-[72px] text-sm border-transparent bg-transparent hover:bg-white hover:border-gray-200 dark:hover:bg-gray-900 focus:bg-white dark:focus:bg-gray-900"
                      placeholder="Describe the point discussed..."
                    />
                  </td>

                  {/* Contact person */}
                  <td className="px-1 py-1 w-36">
                    <Textarea
                      value={row.contactPerson}
                      onChange={(e) => onUpdate(row.id, { contactPerson: e.target.value })}
                      className="min-h-[72px] text-sm border-transparent bg-transparent hover:bg-white hover:border-gray-200 dark:hover:bg-gray-900 focus:bg-white dark:focus:bg-gray-900"
                      placeholder="Name..."
                    />
                  </td>

                  {/* Dependency */}
                  <td className="px-1 py-1 w-40">
                    <Textarea
                      value={row.dependency}
                      onChange={(e) => onUpdate(row.id, { dependency: e.target.value })}
                      className="min-h-[72px] text-sm border-transparent bg-transparent hover:bg-white hover:border-gray-200 dark:hover:bg-gray-900 focus:bg-white dark:focus:bg-gray-900"
                      placeholder="e.g. No dependency..."
                    />
                  </td>

                  {/* Priority */}
                  <td className="px-2 py-3 w-24">
                    <Select
                      value={row.priority}
                      onChange={(e) =>
                        onUpdate(row.id, { priority: e.target.value as MoMRow["priority"] })
                      }
                      className={cn(
                        "text-xs border rounded-lg px-2 py-1.5",
                        PRIORITY_STYLES[row.priority]
                      )}
                    >
                      <option value="">—</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </Select>
                  </td>

                  {/* Status */}
                  <td className="px-2 py-3 w-28">
                    <Select
                      value={row.status}
                      onChange={(e) =>
                        onUpdate(row.id, { status: e.target.value as MoMRow["status"] })
                      }
                      className={cn(
                        "text-xs border rounded-lg px-2 py-1.5",
                        STATUS_STYLES[row.status]
                      )}
                    >
                      <option value="">—</option>
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Done">Done</option>
                    </Select>
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-3 w-20">
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onMove(row.id, "up")}
                        disabled={idx === 0}
                        className="h-6 w-6 p-0"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onMove(row.id, "down")}
                        disabled={idx === rows.length - 1}
                        className="h-6 w-6 p-0"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onDelete(row.id)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
