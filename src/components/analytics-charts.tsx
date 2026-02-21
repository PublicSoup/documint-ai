"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface AnalyticsPoint {
    name: string;
    docs: number;
    views: number;
}

interface AnalyticsChartsProps {
    data: AnalyticsPoint[];
}

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
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
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
                                <XAxis dataKey="name" stroke="#666" />
                                <YAxis stroke="#666" />
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "#111", borderColor: "#333" }}
                                    itemStyle={{ color: "#fff" }}
                                />
                                <Area type="monotone" dataKey="docs" stroke="#8884d8" fillOpacity={1} fill="url(#colorDocs)" />
                                <Area type="monotone" dataKey="views" stroke="#82ca9d" fillOpacity={1} fill="url(#colorViews)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
