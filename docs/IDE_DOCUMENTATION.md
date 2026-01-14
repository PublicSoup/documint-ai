# DocuMint IDE Documentation

## Overview

The DocuMint IDE is an AI-powered development environment that combines traditional code editing with intelligent agent capabilities. Built with Next.js and React, it provides a seamless coding experience with integrated AI assistance.

## Architecture

### Core Components

```
src/components/ide/
├── ai-chat-panel.tsx          # Main AI interaction interface
├── enhanced-ide-layout.tsx    # Main IDE layout with file tree and editor
├── simple-enhanced-editor.tsx # Code editor with enhanced features
├── editor-terminal.tsx        # Editor component with diff viewing
├── file-tree.tsx             # File navigation component
├── enhanced-file-tree.tsx    # Enhanced file tree with actions
├── tool-visualizer.tsx       # Tool execution visualization
├── command-palette.tsx       # Command palette for quick actions
└── context-menu.tsx          # Context menu for file operations
```

### Agent System

```
src/lib/agent/
├── engine.ts                 # Core agent engine with tool execution
└── hooks/use-agent-loop.ts   # Finite State Machine for agent workflow
```

## Features

### 1. AI-Powered Coding Assistant

The IDE integrates a powerful AI agent that can:
- Read and analyze code files
- Execute shell commands
- Apply patches to existing code
- Create new files
- Search through the codebase
- Provide intelligent code suggestions

### 2. Finite State Machine (FSM)

The agent operates through a well-defined state machine:
- **IDLE**: Waiting for user input
- **THINKING**: Analyzing the task and planning
- **EXECUTING**: Running tools and commands
- **WAITING_USER**: Pausing for user approval/input
- **REVIEWING**: Checking results and next steps
- **COMPLETED**: Task finished successfully

### 3. Smart Code Patching

The IDE features intelligent code patching that:
- Understands code context and structure
- Applies changes to specific code blocks rather than entire files
- Preserves existing code formatting and style
- Provides diff visualization for review

### 4. Multi-File Operations

- File tree navigation and management
- Tabbed interface for multiple open files
- Drag-and-drop file operations
- Context menu for file actions (create, delete, rename)

### 5. Tool Visualization

All agent tool executions are visualized in real-time:
- File reading operations
- Command execution with terminal output
- Code patching operations
- File creation and modification

## Usage Guide

### Getting Started

1. **File Management**
   - Use the left sidebar file tree to navigate files
   - Click on files to open them in the editor
   - Use the tab interface to switch between open files
   - Right-click on files for context menu options

2. **AI Interaction**
   - Open the AI chat panel on the right
   - Type natural language commands like:
     - "Create a new React component called Button"
     - "Add comments to this function"
     - "Refactor this code to use hooks"
     - "Find and fix bugs in this file"

3. **Hotkeys**
   - `Cmd/Ctrl + S`: Save current file
   - `Cmd/Ctrl + B`: Toggle sidebar
   - `Cmd/Ctrl + I`: Open inline AI prompt
   - `Cmd/Ctrl + P`: Open command palette
   - `Cmd/Ctrl + ``: Toggle terminal

### Agent Capabilities

The AI agent has access to several powerful tools:

1. **read_file(path)**: Read the contents of a file
2. **write_file(path, content)**: Create or overwrite a file
3. **apply_patch(path, code)**: Apply intelligent code patches
4. **run_command(cmd)**: Execute shell commands
5. **list_files(path)**: List files in a directory
6. **search_files(pattern)**: Search for files by name pattern
7. **grep_search(query)**: Search for content within files

### Code Application

When the agent suggests code changes:
- Code blocks can be applied directly to the current file
- Changes can be reviewed in a diff view before applying
- Applied changes are tracked in the undo stack
- Original file content can be restored if needed

## Technical Implementation

### Agent Engine

The agent engine (`src/lib/agent/engine.ts`) handles:
- Tool execution and result processing
- Safety checks for destructive operations
- Context management and state tracking
- Communication with the AI service

### FSM Integration

The Finite State Machine (`src/hooks/use-agent-loop.ts`) manages:
- Agent state transitions
- History tracking for debugging
- Action dispatching and state updates
- Integration with the UI for real-time feedback

### Smart Patching

The code patching system intelligently:
- Identifies function and class boundaries
- Preserves existing code structure
- Handles indentation and formatting
- Falls back to full replacement when needed

## Best Practices

### For Users
- Start with simple tasks to understand agent capabilities
- Use specific, clear instructions for complex operations
- Review suggested code changes before applying
- Utilize the diff viewer to understand changes
- Save frequently to maintain progress

### For Developers
- Extend the agent by adding new tools in `engine.ts`
- Customize the FSM states for specific workflows
- Enhance the UI components for better user experience
- Add safety checks for new tool operations

## Troubleshooting

### Common Issues

1. **Agent Not Responding**
   - Check network connectivity
   - Verify LM Studio is running
   - Ensure API endpoints are accessible

2. **File Operations Failing**
   - Check file permissions
   - Verify file paths are correct
   - Ensure sufficient disk space

3. **Code Patching Issues**
   - Complex code structures may require manual intervention
   - Very large files may need to be processed in chunks
   - Syntax errors in patches will be flagged for review

### Debugging

- Check browser console for error messages
- Review agent state transitions in the status bar
- Use the command palette for diagnostic commands
- Enable debug logging in development mode

## Future Enhancements

Planned improvements include:
- AST-based code analysis for more accurate patching
- Git integration for version control
- Plugin system for custom tools
- Enhanced collaboration features
- Performance optimizations for large codebases
