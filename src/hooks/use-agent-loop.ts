import { useState, useReducer, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type AgentState =
    | 'IDLE'
    | 'THINKING' // Analysis & Planning
    | 'EXECUTING' // Running a tool
    | 'WAITING_USER' // Waiting for approval/input
    | 'REVIEWING' // Checking results
    | 'COMPLETED';

export interface AgentContext {
    messages: any[]; // Chat history
    files: Map<string, string>; // Known file contents
    terminalOutput: string[]; // Recent terminal logs
}

type AgentAction =
    | { type: 'START_TASK'; task: string }
    | { type: 'SET_THINKING' }
    | { type: 'TOOL_START'; tool: string }
    | { type: 'TOOL_END'; result: string }
    | { type: 'ASK_USER'; question: string }
    | { type: 'COMPLETE'; summary: string }
    | { type: 'RESET' };

interface FSMState {
    status: AgentState;
    currentTool: string | null;
    currentTask: string | null;
    history: string[]; // State transition log
}

// ============================================================================
// Reducer
// ============================================================================

const initialState: FSMState = {
    status: 'IDLE',
    currentTool: null,
    currentTask: null,
    history: []
};

function agentReducer(state: FSMState, action: AgentAction): FSMState {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const log = (msg: string) => `[${timestamp}] ${msg}`;

    switch (action.type) {
        case 'START_TASK':
            return {
                ...state,
                status: 'THINKING',
                currentTask: action.task,
                history: [...state.history, log(`Started task: ${action.task}`)]
            };
        case 'SET_THINKING':
            return {
                ...state,
                status: 'THINKING',
                currentTool: null
            };
        case 'TOOL_START':
            return {
                ...state,
                status: 'EXECUTING',
                currentTool: action.tool,
                history: [...state.history, log(`Executing tool: ${action.tool}`)]
            };
        case 'TOOL_END':
            return {
                ...state,
                status: 'THINKING', // Back to thinking after tool
                currentTool: null,
                history: [...state.history, log(`Tool finished`)]
            };
        case 'ASK_USER':
            return {
                ...state,
                status: 'WAITING_USER',
                history: [...state.history, log(`Waiting for user: ${action.question}`)]
            };
        case 'COMPLETE':
            return {
                ...state,
                status: 'COMPLETED',
                currentTask: null,
                history: [...state.history, log(`Completed: ${action.summary}`)]
            };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentLoop() {
    const [state, dispatch] = useReducer(agentReducer, initialState);

    const startTask = useCallback((task: string) => {
        dispatch({ type: 'START_TASK', task });
    }, []);

    const setThinking = useCallback(() => {
        dispatch({ type: 'SET_THINKING' });
    }, []);

    const executeTool = useCallback((toolName: string) => {
        dispatch({ type: 'TOOL_START', tool: toolName });
        // NOTE: Actual execution logic will be handled by the Engine, this just tracks state
    }, []);

    const finishTool = useCallback((result: string) => {
        dispatch({ type: 'TOOL_END', result });
    }, []);

    const reset = useCallback(() => {
        dispatch({ type: 'RESET' });
    }, []);

    return {
        state,
        startTask,
        setThinking,
        executeTool,
        finishTool,
        reset
    };
}
