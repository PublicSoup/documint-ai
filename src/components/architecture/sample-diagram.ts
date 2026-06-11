export const SAMPLE_ARCHITECTURE_DIAGRAM = `flowchart TB
    subgraph Frontend["🎨 Frontend"]
        direction TB
        Dashboard["📊 Dashboard"]
        IDE["💻 Cloud IDE"]
        Auth["🔐 Auth Pages"]
    end

    subgraph Backend["⚙️ Backend API"]
        direction TB
        AuthAPI["Auth API"]
        FilesAPI["Files API"]
        AgentAPI["AI Agent API"]
        AuditAPI["Audit API"]
    end

    subgraph Services["🔧 Core Services"]
        direction TB
        AIProvider["Gemini AI"]
        Storage["Supabase Storage"]
        Database["PostgreSQL"]
    end

    Dashboard --> FilesAPI
    Dashboard --> AuditAPI
    IDE --> AgentAPI
    IDE --> FilesAPI
    Auth --> AuthAPI

    AuthAPI --> Database
    FilesAPI --> Storage
    FilesAPI --> Database
    AgentAPI --> AIProvider
    AuditAPI --> Database

    classDef frontend fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef backend fill:#10b981,stroke:#059669,color:#fff
    classDef services fill:#f59e0b,stroke:#d97706,color:#fff

    class Dashboard,IDE,Auth frontend
    class AuthAPI,FilesAPI,AgentAPI,AuditAPI backend
    class AIProvider,Storage,Database services`;
