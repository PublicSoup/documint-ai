
import React from 'react';

export function HelloWorld({ name = "World" }: { name?: string }) {
    return (
        <div className="p-4 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">
            <h1>Hello {name}!</h1>
            <p>This is a test component demonstrating AI edits.</p>
        </div>
    );
}
