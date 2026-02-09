# DocuMint AI

**The Intelligent Code Documentation Platform**

DocuMint AI is a next-generation "Code-to-Docs" engine and Agentic IDE that helps developers understand, document, and refactor their codebase automatically.

## 🚀 Features

*   **Cloud IDE**: A fully functional, Monaco-based integrated development environment in your browser.
*   **AI Agents**: Autonomous agents (powered by Qwen/OpenAI) that can write code, fix bugs, and answer questions.
*   **Smart Refactoring**: Regex-based smart patching that attempts to safely modify your code.
*   **Live Documentation**: Instantly generate beautiful documentation sites from your source code.
*   **Team Collaboration**: Real-time shared workspaces for engineering teams.

## 🛠️ Stack

*   **Framework**: Next.js 14 (App Router)
*   **Database**: PostgreSQL + Prisma
*   **Styling**: TailwindCSS + Framer Motion
*   **AI**: Google Gemini 2.0 Flash
*   **Payments**: Stripe

## 📦 Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/documint-ai.git
    cd documint-ai
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Setup Environment:
    Copy `.env.example` to `.env` and fill in your keys.

4.  Run Database Migrations:
    ```bash
    npx prisma generate
    npx prisma db push
    ```

5.  Start Development Server:
    ```bash
    npm run dev
    ```

## 🚢 Deployment

Deployed via Vercel. See `DOMAIN_SETUP.md` for custom domain configuration.

## 📄 License

Private / Proprietary.
  
