# DocuMint IDE & Agent Documentation

## Overview

The DocuMint IDE is a powerful cloud-based development environment that combines traditional code editing with an intelligent AI agent. Built with Next.js, React, and Monaco Editor, it provides a seamless coding experience with integrated AI assistance and comprehensive tooling.

## Architecture

### Core Components

```
src/
├── app/
│   ├── code/                  # Main IDE page
│   ├── dashboard/             # Dashboard and settings
│   └── api/                   # API routes for all features
├── components/
│   ├── ide/                   # IDE-specific components
│   ├── ui/                    # Reusable UI components
│   └── ...                    # Other feature components
├── lib/
│   ├── agent/                 # AI agent engine and tools
│   ├── ai/                    # AI service integration
│   └── ...                    # Utility libraries
├── hooks/                     # Custom React hooks
└── scripts/                   # Utility scripts
```

### IDE Components

```
src/components/ide/
├── ai-chat-panel.tsx          # Main AI interaction interface
├── enhanced-ide-layout.tsx    # Main IDE layout with file tree and editor
├── ide-layout.tsx            # Primary IDE layout component
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
- Generate documentation
- Perform code archaeology and analysis

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

### 6. Integrated Development Tools

- **Code Editor**: Monaco Editor with syntax highlighting
- **Terminal**: Embedded terminal for command execution
- **File Browser**: Hierarchical file navigation
- **Command Palette**: Quick access to commands (Cmd+P)
- **Inline Agent**: Context-specific AI assistance (Cmd+I)
- **Diff Viewer**: Compare changes before applying
- **Activity Feed**: Recent activity and notifications

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
     - "Explain how this authentication system works"

3. **Hotkeys**
   - `Cmd/Ctrl + S`: Save current file
   - `Cmd/Ctrl + B`: Toggle sidebar
   - `Cmd/Ctrl + I`: Open inline AI prompt
   - `Cmd/Ctrl + P`: Open command palette
   - `Cmd/Ctrl + K`: Open command palette
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
- Real filesystem access with proper error handling

### FSM Integration

The Finite State Machine (`src/hooks/use-agent-loop.ts`) manages:
- Agent state transitions
- History tracking for debugging
- Action dispatching and state updates
- Integration with the UI for real-time feedback
- Tool execution lifecycle management

### Smart Patching

The code patching system intelligently:
- Identifies function and class boundaries
- Preserves existing code structure
- Handles indentation and formatting
- Falls back to full replacement when needed
- Uses AST-aware parsing for better accuracy

### Context Awareness

The system maintains comprehensive context:
- Full codebase awareness through context builder
- Active file content and unsaved changes
- Related file detection via import analysis
- Token-efficient context management
- Cross-file reference tracking

## Advanced Features

### 1. Code Archaeology
- Legacy code analysis and explanation
- Technical debt identification
- Architecture documentation generation
- Pattern recognition across codebase

### 2. Documentation Generation
- Automatic API documentation
- Inline code comments
- README generation
- Architecture diagrams

### 3. Code Quality Analysis
- Security vulnerability detection
- Performance optimization suggestions
- Best practice recommendations
- Style guide compliance checking

### 4. Collaboration Features
- Team-based file sharing
- Comment system with @mentions
- Review workflows
- Version control integration

## API Endpoints

### Core IDE APIs
```
/api/files/[fileId]/raw          # File CRUD operations
/api/files/create               # Create new files
/api/files/list                 # List files
/api/chat                       # AI chat interface
```

### Documentation APIs
```
/api/generate-docs              # Generate documentation
/api/docs/[id]                  # Document management
/api/docs/suggest               # Documentation suggestions
/api/archaeology                # Code archaeology analysis
```

### Analysis APIs
```
/api/analyze                    # Code analysis
/api/analyze/full               # Full codebase analysis
/api/code-quality               # Code quality scoring
```

## Best Practices

### For Users
- Start with simple tasks to understand agent capabilities
- Use specific, clear instructions for complex operations
- Review suggested code changes before applying
- Utilize the diff viewer to understand changes
- Save frequently to maintain progress
- Use the command palette for quick access to features

### For Developers
- Extend the agent by adding new tools in `engine.ts`
- Customize the FSM states for specific workflows
- Enhance the UI components for better user experience
- Add safety checks for new tool operations
- Implement proper error handling and logging

## Troubleshooting

### Common Issues

1. **Agent Not Responding**
   - Check network connectivity
   - Verify LM Studio is running
   - Ensure API endpoints are accessible
   - Check browser console for errors

2. **File Operations Failing**
   - Check file permissions
   - Verify file paths are correct
   - Ensure sufficient disk space
   - Check rate limiting

3. **Code Patching Issues**
   - Complex code structures may require manual intervention
   - Very large files may need to be processed in chunks
   - Syntax errors in patches will be flagged for review

4. **AI Generation Problems**
   - Ensure LM Studio is properly configured
   - Check model availability and context limits
   - Verify API keys for fallback services

### Debugging

- Check browser console for error messages
- Review agent state transitions in the status bar
- Use the command palette for diagnostic commands
- Enable debug logging in development mode
- Monitor network requests in browser dev tools

## Security Features

### Access Control
- Role-based access control (RBAC)
- Subscription-based feature gating
- File-level permissions
- Team collaboration controls

### Data Protection
- Encrypted file storage
- Secure API authentication
- Rate limiting and abuse prevention
- Audit logging for all operations

### Safe Execution
- Destructive command blocking
- Sandboxed command execution
- Input validation and sanitization
- Resource usage monitoring

## Performance Optimization

### Client-Side
- Code splitting and lazy loading
- Efficient state management
- Virtualized file trees
- Smart caching strategies

### Server-Side
- Database query optimization
- Connection pooling
- Background job processing
- CDN integration for static assets

## Future Enhancements

Planned improvements include:
- AST-based code analysis for more accurate patching
- Git integration for version control
- Plugin system for custom tools
- Enhanced collaboration features
- Performance optimizations for large codebases
- Mobile-responsive interface
- Offline mode with sync capabilities
- Advanced debugging tools
- Custom AI model training
- Enterprise security features

## Integration Guide

### Environment Variables
```
DATABASE_URL=postgresql://user:pass@localhost:5432/documint
NEXTAUTH_SECRET=your-secret-key
LM_STUDIO_URL=http://localhost:1234/v1
OPENAI_API_KEY=sk-... (optional fallback)
GITHUB_CLIENT_ID=... (for GitHub integration)
STRIPE_SECRET_KEY=... (for payments)
```

### Deployment
- PostgreSQL database required
- Node.js 18+ runtime
- LM Studio running with code model
- Reverse proxy (nginx/Caddy) recommended
- SSL certificate for production

### Customization
- Theme customization via CSS variables
- Tool addition in `src/lib/agent/engine.ts`
- Component extension in `src/components/ide/`
- API endpoint addition in `src/app/api/`
