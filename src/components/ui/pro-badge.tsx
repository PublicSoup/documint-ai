import { cn } from "@/lib/utils";

interface ProBadgeProps {
    className?: string;
}

export function ProBadge({ className }: ProBadgeProps) {
    return (
        <span className={cn(
            "px-1.5 py-0.5 text-[10px] font-bold tracking-wider rounded bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm",
            className
        )}>
            PRO
        </span>
    );
}
