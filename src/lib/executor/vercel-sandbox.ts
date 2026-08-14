import type {
    CommandHandle,
    RunCommandOptions,
    Sandbox,
    SandboxCreateOptions,
    WriteFileInput,
} from "./types";

/**
 * Adapter that presents `@vercel/sandbox` through the provider-agnostic
 * {@link Sandbox} interface, so the Vercel deployment keeps working after the
 * call sites are migrated off the direct `import("@vercel/sandbox")`.
 *
 * The module is loaded via dynamic import (below) and never referenced at
 * module scope, matching the existing "CF Workers / non-Vercel safety" pattern.
 */

/** The slice of a `@vercel/sandbox` command we depend on. */
interface VercelCommand {
    cmdId?: string;
    exitCode?: number;
    stdout(): Promise<string>;
    stderr(): Promise<string>;
}

/** The slice of a `@vercel/sandbox` instance we depend on. */
interface VercelSandboxInstance {
    sandboxId: string;
    writeFiles(files: { path: string; content: Buffer }[]): Promise<void>;
    readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null>;
    runCommand(params: Record<string, unknown>): Promise<VercelCommand>;
    domain(port: number): string;
    stop(): Promise<unknown>;
}

class VercelSandboxAdapter implements Sandbox {
    constructor(private readonly instance: VercelSandboxInstance) {}

    get sandboxId(): string {
        return this.instance.sandboxId;
    }

    writeFiles(files: WriteFileInput[]): Promise<void> {
        return this.instance.writeFiles(files);
    }

    async writeFile(path: string, content: string | Buffer): Promise<void> {
        await this.instance.writeFiles([
            { path, content: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8") },
        ]);
    }

    readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null> {
        return this.instance.readFileToBuffer(file);
    }

    async runCommand(options: RunCommandOptions): Promise<CommandHandle> {
        const command = await this.instance.runCommand({
            cmd: options.cmd,
            args: options.args,
            cwd: options.cwd,
            env: options.env,
            detached: options.detached,
            stdout: options.stdout,
            stderr: options.stderr,
        });
        return {
            cmdId: command.cmdId ?? "",
            // A getter so a detached command's exit code is read live as it updates.
            get exitCode(): number | undefined {
                return command.exitCode;
            },
            stdout: () => command.stdout(),
            stderr: () => command.stderr(),
        };
    }

    domain(port: number): string {
        return this.instance.domain(port);
    }

    async stop(): Promise<void> {
        await this.instance.stop();
    }
}

export async function createVercelSandbox(options?: SandboxCreateOptions): Promise<Sandbox> {
    const mod = await import("@vercel/sandbox");
    const SandboxClass = mod.Sandbox as unknown as {
        create(params: Record<string, unknown>): Promise<VercelSandboxInstance>;
    };
    const instance = await SandboxClass.create({
        runtime: options?.runtime,
        timeout: options?.timeout,
        ports: options?.ports,
    });
    return new VercelSandboxAdapter(instance);
}
