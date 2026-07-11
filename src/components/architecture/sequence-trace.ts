/**
 * Trace a real request flow through the dependency graph.
 *
 * The old sequence "diagram" collapsed the whole project into six fixed boxes
 * with aggregate counts — the same picture for every repo. This instead walks
 * the *actual* import edges out of a chosen entry point (a page, a root module,
 * or a hub), producing an ordered list of messages between the real files it
 * touches: page → renders Component → uses Hook → calls API → uses Lib.
 */

import type { GraphDataNode, GraphDataEdge } from "@/lib/graph/graph-data";
import { INBOUND_VERB } from "@/lib/graph/graph-data";
import type { NodeType } from "@/lib/graph/project-graph";

export interface TraceActor {
    id: string;
    name: string;
    type: NodeType;
    riskScore: number;
    fileId: string;
}

export interface TraceMessage {
    from: string;
    to: string;
    verb: string;
    /** 1-based order for the swimlane's autonumber column. */
    step: number;
}

export interface SequenceTrace {
    entry: TraceActor;
    actors: TraceActor[];
    messages: TraceMessage[];
    /** True when the walk hit its limit and stopped early. */
    truncated: boolean;
}

const MAX_MESSAGES = 40;
const MAX_DEPTH = 6;

function toActor(node: GraphDataNode): TraceActor {
    return {
        id: node.id,
        name: node.name,
        type: node.type,
        riskScore: node.riskScore,
        fileId: node.fileId,
    };
}

/**
 * Breadth-first walk of the import edges out of `entryId`. Each newly traversed
 * edge becomes a message; actors are recorded in first-seen order so the
 * swimlane reads top-to-bottom in the order the flow reaches them.
 */
export function traceSequence(
    nodes: GraphDataNode[],
    edges: GraphDataEdge[],
    entryId: string,
): SequenceTrace | null {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const entry = nodeById.get(entryId);
    if (!entry) return null;

    const adjacency = new Map<string, string[]>();
    for (const { from, to } of edges) {
        const list = adjacency.get(from) ?? [];
        list.push(to);
        adjacency.set(from, list);
    }

    const actors = new Map<string, TraceActor>([[entry.id, toActor(entry)]]);
    const messages: TraceMessage[] = [];
    const seenEdge = new Set<string>();
    const depth = new Map<string, number>([[entry.id, 0]]);
    const queue: string[] = [entry.id];
    let truncated = false;

    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = depth.get(current) ?? 0;
        if (currentDepth >= MAX_DEPTH) continue;

        const targets = [...(adjacency.get(current) ?? [])].sort((a, b) => {
            // Prefer edges that move "down" the request flow for a readable trace.
            const ta = nodeById.get(a)?.type;
            const tb = nodeById.get(b)?.type;
            return LAYER_RANK(tb) - LAYER_RANK(ta) === 0
                ? (nodeById.get(b)?.inDegree ?? 0) - (nodeById.get(a)?.inDegree ?? 0)
                : LAYER_RANK(ta) - LAYER_RANK(tb);
        });

        for (const target of targets) {
            const targetNode = nodeById.get(target);
            if (!targetNode) continue;
            const edgeKey = `${current} ${target}`;
            if (seenEdge.has(edgeKey)) continue;
            seenEdge.add(edgeKey);

            if (messages.length >= MAX_MESSAGES) {
                truncated = true;
                break;
            }

            if (!actors.has(target)) actors.set(target, toActor(targetNode));
            messages.push({
                from: current,
                to: target,
                verb: INBOUND_VERB[targetNode.type],
                step: messages.length + 1,
            });

            if (!depth.has(target)) {
                depth.set(target, currentDepth + 1);
                queue.push(target);
            }
        }
        if (truncated) break;
    }

    return {
        entry: toActor(entry),
        actors: [...actors.values()],
        messages,
        truncated,
    };
}

const LAYER_RANK_MAP: Record<NodeType, number> = {
    page: 0,
    component: 1,
    hook: 2,
    api: 3,
    lib: 4,
    unknown: 5,
};

function LAYER_RANK(type: NodeType | undefined): number {
    return type ? LAYER_RANK_MAP[type] : 9;
}
