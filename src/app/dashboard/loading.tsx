import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-7rem)]">
            {/* Left Sidebar Skeleton */}
            <div className="md:col-span-2 space-y-6 flex flex-col h-full overflow-hidden">
                {/* Team Switcher Skeleton */}
                <div className="space-y-4">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                </div>

                {/* Actions Grid Skeleton */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 shrink-0 px-1">
                    <Card className="items-center text-center p-6 bg-white/5 border-white/5">
                        <div className="flex flex-col items-center gap-4">
                            <Skeleton className="h-12 w-12 rounded-xl" />
                            <div className="space-y-2 w-full flex flex-col items-center">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-2 w-32" />
                            </div>
                        </div>
                    </Card>
                    <Card className="items-center text-center p-6 bg-white/5 border-white/5">
                        <div className="flex flex-col items-center gap-4">
                            <Skeleton className="h-12 w-12 rounded-xl" />
                            <div className="space-y-2 w-full flex flex-col items-center">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-2 w-32" />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* File Tree Skeleton */}
                <Card className="flex-grow flex flex-col bg-[#1e1e1e]/50 border-white/5 overflow-hidden">
                    <CardHeader className="pb-2">
                        <Skeleton className="h-4 w-32" />
                    </CardHeader>
                    <CardContent className="space-y-3 p-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton className="h-4 w-4 rounded-full" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Right Content Skeleton */}
            <div className="md:col-span-2 h-full overflow-hidden">
                <Card className="h-full bg-white/5 border-white/5">
                    <CardHeader className="border-b border-white/5 pb-4">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-6 w-48" />
                            <div className="flex gap-2">
                                <Skeleton className="h-8 w-20 rounded-lg" />
                                <Skeleton className="h-8 w-8 rounded-lg" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/6" />
                        <div className="py-4">
                            <Skeleton className="h-32 w-full rounded-xl" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
