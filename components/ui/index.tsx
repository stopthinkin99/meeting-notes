"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "primary" | "danger" | "ghost";
    size?: "sm" | "md" | "lg";
  }
>(({ className, variant = "default", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg border transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed",
      {
        "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800":
          variant === "default",
        "border-gray-900 bg-gray-900 text-white hover:bg-gray-700 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900":
          variant === "primary",
        "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-400":
          variant === "danger",
        "border-transparent bg-transparent text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800":
          variant === "ghost",
        "text-xs px-2.5 py-1.5": size === "sm",
        "text-sm px-3.5 py-2": size === "md",
        "text-sm px-4 py-2.5": size === "lg",
      },
      className
    )}
    {...props}
  />
));
Button.displayName = "Button";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-gray-100/10",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
      className
    )}
    {...props}
  />
));
Select.displayName = "Select";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors resize-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "live";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border",
        {
          "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700":
            variant === "default",
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800":
            variant === "success",
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800":
            variant === "warning",
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800":
            variant === "danger",
          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800":
            variant === "info",
          "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800":
            variant === "live",
        },
        className
      )}
    >
      {variant === "live" && (
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
      )}
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
      {children}
    </p>
  );
}
