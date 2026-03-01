"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import dynamic from 'next/dynamic';

interface AnalyticsPoint {
    name: string;
    docs: number;
    views: number;
}

interface AnalyticsChartsProps {
    data: AnalyticsPoint[];
}

const DynamicAreaChart = dynamic(() => import('recharts').then((mod) => mod.AreaChart), {
    loading: () => <p>Loading chart...</p>,
    ssr: false,
});

const DynamicArea = dynamic(() => import('recharts').then((mod) => mod.Area), {
    ssr: false,
});

const DynamicXAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), {
    ssr: false,
});

const DynamicYAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), {
    ssr: false,
});

const DynamicCartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), {
    ssr: false,
});

const DynamicTooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), {
    ssr: false,
});

const DynamicResponsiveContainer = dynamic(() => import('recharts').then((mod) => mod.ResponsiveContainer), {
    ssr: false,
});

export function AnalyticsCharts({ data }: AnalyticsChartsProps) {
    const hasData = data.length > 0;

    return (
        <Card className="col-span-1 lg:col-span-2 border-white/5 bg-black/20">
            <CardHeader>
                <CardTitle className="text-white">Documentation Growth</CardTitle>
            </CardHeader>
            <CardContent>
                {!hasData ? (
                    <div className="h-[300px] w-full flex items-center justify-center text-sm text-zinc-400 border border-white/5 rounded-lg bg-black/10">
                        No historical analytics yet.
                    </div>
                ) : (
                    <div className="h-[300px] w-full">
                        <DynamicResponsiveContainer width="100%" height="100%">
                            <DynamicAreaChart
                                data={data}
                                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                            >
                                <defs>
                                    <linearGradient id="colorDocs" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <DynamicXAxis dataKey="name" stroke="#666" />
                                <DynamicYAxis stroke="#666" />
                                <DynamicCartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <DynamicTooltip
                                    contentStyle={{ backgroundColor: "#111", borderColor: "#333" }}
                                    itemStyle={{ color: "#fff" }}
                                />
                                <DynamicArea type="monotone" dataKey="docs" stroke="#8884d8" fillOpacity={1} fill="url(#colorDocs)" />
                                <DynamicArea type="monotone" dataKey="views" stroke="#82ca9d" fillOpacity={1} fill="url(#colorViews)" />
                            </DynamicAreaChart>
                        </DynamicResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
