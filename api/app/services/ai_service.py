from app.models import AnalyzeRequest, AnalyzeResponse, CodeSuggestion
import time
import os
from typing import Optional

class AIService:
    # Class-level cache for model name
    _cached_model_name: Optional[str] = None
    
    @staticmethod
    async def _get_lm_studio_model() -> Optional[str]:
        """
        Auto-detect the currently loaded model in LM Studio.
        Falls back to environment variable or default.
        """
        import aiohttp
        
        # Check environment variable first
        env_model = os.getenv('LM_STUDIO_MODEL_NAME', '').strip()
        if env_model and env_model.lower() != 'auto':
            return env_model
        
        # Return cached model name if available
        if AIService._cached_model_name:
            return AIService._cached_model_name
        
        # Try to auto-detect from LM Studio API
        lm_studio_url = os.getenv('LM_STUDIO_URL', 'http://localhost:1234')
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{lm_studio_url}/v1/models", timeout=2) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('data') and len(data['data']) > 0:
                            model_id = data['data'][0].get('id', '')
                            AIService._cached_model_name = model_id
                            print(f"✓ Auto-detected LM Studio model: {model_id}")
                            return model_id
        except Exception as e:
            pass  # LM Studio not running yet
        
        # Fallback to common model names
        return "qwen2.5-coder"  # Default fallback
    
    @staticmethod
    async def analyze_code(request: AnalyzeRequest) -> AnalyzeResponse:
        """
        Analyzes the code using static analysis tools + LLM (LM Studio).
        Runs CPU-bound tasks in a separate thread pool.
        """
        import asyncio
        import hashlib
        
        # 1. Check Cache
        cache_key = hashlib.md5(f"{request.language}:{request.code}".encode()).hexdigest()
        # TODO: Redis check
        
        loop = asyncio.get_running_loop()
        
        # Run Static Analysis (CPU-bound) in thread pool
        static_analysis_future = loop.run_in_executor(None, AIService._analyze_sync, request)
        
        # Run LLM Analysis (IO-bound) concurrently
        llm_analysis_future = AIService._analyze_with_llm(request)
        
        # Wait for both
        static_result, llm_result = await asyncio.gather(
            static_analysis_future, 
            llm_analysis_future
        )
        
        # Merge Results
        # If LLM failed (None), just use static result
        if llm_result:
            # Append LLM suggestions to static ones
            static_result.suggestions.extend(llm_result.suggestions)
            # Prepend LLM summary
            static_result.summary = f"🤖 AI Insight: {llm_result.summary}\n\n🔍 Static Analysis: {static_result.summary}"
            
        return static_result

    @staticmethod
    async def _analyze_with_llm(request: AnalyzeRequest) -> AnalyzeResponse | None:
        """
        Query LM Studio (Qwen 2.5 Coder or other loaded model) for advanced analysis.
        Returns None if LM Studio is offline.
        """
        import aiohttp
        from app.models import CodeSuggestion
        
        lm_studio_url = os.getenv('LM_STUDIO_URL', 'http://localhost:1234')
        LM_STUDIO_URL = f"{lm_studio_url}/v1/chat/completions"
        
        # Auto-detect model name
        model_name = await AIService._get_lm_studio_model()
        
        # Optimized prompt for Qwen 2.5 Coder - more structured and explicit
        prompt = f"""
You are an expert code analysis assistant specializing in {request.language}.

Analyze the following code and provide:
1. **Summary**: A concise description of what the code does (1-2 sentences)
2. **Issues**: Any bugs, security vulnerabilities, or performance problems
3. **Improvements**: Specific, actionable suggestions

Respond ONLY with valid JSON in this exact format:
{{
    "summary": "Brief description of the code's purpose and functionality",
    "suggestions": [
        {{
            "severity": "info",
            "message": "Description of the issue or observation",
            "suggestion": "Specific recommendation for improvement",
            "line_number": null
        }}
    ]
}}

Severity levels: "info" (suggestions), "warning" (potential issues), "critical" (bugs/security)

CODE TO ANALYZE:
```{request.language}
{request.code}
```

JSON Response:"""
        
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": "You are a code analysis expert. Respond only with valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.1,  # Very low temp for deterministic code analysis
                    "max_tokens": 2048   # Increased for larger codebases
                }
                
                async with session.post(LM_STUDIO_URL, json=payload, timeout=60) as response:
                    if response.status != 200:
                        print(f"LM Studio Error: {response.status}")
                        return None
                        
                    data = await response.json()
                    content = data['choices'][0]['message']['content']
                    
                    # Parse JSON from content (handle potential markdown blocks)
                    import json
                    import re
                    
                    # Strip markdown code blocks if present
                    json_str = re.sub(r'```json\n|\n```', '', content).strip()
                    
                    try:
                        llm_data = json.loads(json_str)
                        
                        suggestions = []
                        for s in llm_data.get('suggestions', []):
                            suggestions.append(CodeSuggestion(
                                severity=s.get('severity', 'info'),
                                message=s.get('message', 'AI Suggestion'),
                                suggestion=s.get('suggestion', ''),
                                line_number=s.get('line_number')
                            ))
                            
                        return AnalyzeResponse(
                            summary=llm_data.get('summary', ''),
                            complexity_score=1,  # Minimum valid score
                            suggestions=suggestions,
                            refactored_code=None
                        )
                    except json.JSONDecodeError:
                        print(f"Failed to parse LLM JSON: {content}")
                        return None
                        
        except Exception as e:
            print(f"LLM Offline/Error: {e}")  # Debug: show LLM errors
            return None

    @staticmethod
    def _analyze_sync(request: AnalyzeRequest) -> AnalyzeResponse:
        """Synchronous version of analysis logic to be run in executor"""
        import ast
        import tempfile
        import os
        import subprocess
        import json
        import re
        import radon.complexity as radon_cc
        import autopep8

        suggestions = []
        complexity_score = 1
        summary_parts = []
        refactored_code = None
        language = request.language.lower()

        # Create a temporary file for tools that require file input
        suffix_map = {
            'python': '.py',
            'javascript': '.js',
            'typescript': '.ts',
            'java': '.java',
            'go': '.go',
            'rust': '.rs',
            'cpp': '.cpp',
            'c': '.c',
        }
        suffix = suffix_map.get(language, '.txt')
        
        with tempfile.NamedTemporaryFile(mode='w', suffix=suffix, delete=False) as temp_file:
            temp_file.write(request.code)
            temp_file_path = temp_file.name

        try:
            # ============================================================
            # PYTHON ANALYSIS
            # ============================================================
            if language == "python":
                # 1. Complexity Analysis (Radon)
                try:
                    complexity_data = radon_cc.cc_visit(request.code)
                    if complexity_data:
                        avg_complexity = sum(c.complexity for c in complexity_data) / len(complexity_data)
                        complexity_score = min(10, max(1, int(avg_complexity)))
                        
                        summary_parts.append(f"Code complexity is rated {complexity_score}/10.")
                        
                        for item in complexity_data:
                            if item.complexity > 5:
                                suggestions.append(CodeSuggestion(
                                    severity="warning",
                                    message=f"Function '{item.name}' is too complex (Cyclomatic Complexity: {item.complexity}).",
                                    suggestion="Refactor this function to improve readability and maintainability.",
                                    line_number=item.lineno
                                ))
                except Exception as e:
                    print(f"Radon error: {e}")

                # 2. Security Analysis (Bandit)
                try:
                    cmd = ["bandit", "-q", "-f", "json", temp_file_path]
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    
                    if result.stdout.strip():
                        bandit_data = json.loads(result.stdout)
                        for vuln in bandit_data.get('results', []):
                            vuln_category = AIService._get_vuln_category(vuln['test_id'])
                            suggestions.append(CodeSuggestion(
                                severity="critical" if vuln['issue_severity'] == 'HIGH' else "warning",
                                message=f"🔒 {vuln_category}: {vuln['issue_text']}",
                                suggestion=f"Fix {vuln['test_id']} vulnerability. More info: {vuln['more_info']}",
                                line_number=vuln['line_number']
                            ))
                        
                        if bandit_data.get('results'):
                            summary_parts.append(f"Found {len(bandit_data['results'])} security vulnerabilities.")
                except Exception as e:
                    print(f"Bandit error: {e}")

                # 3. Syntax/Error Analysis (AST)
                try:
                    ast.parse(request.code)
                except SyntaxError as e:
                    suggestions.append(CodeSuggestion(
                        severity="critical",
                        message=f"Syntax Error: {e.msg}",
                        suggestion="Fix the syntax error to allow further analysis.",
                        line_number=e.lineno
                    ))
                    return AnalyzeResponse(
                        summary="Code contains fatal syntax errors.",
                        complexity_score=10,
                        suggestions=suggestions,
                        refactored_code=None
                    )

                # 4. Refactoring (Autopep8)
                try:
                    refactored = autopep8.fix_code(request.code, options={'aggressive': 1})
                    if refactored.strip() != request.code.strip():
                        refactored_code = refactored
                        summary_parts.append("Auto-refactoring available.")
                        suggestions.append(CodeSuggestion(
                            severity="info",
                            message="Code style inconsistencies detected.",
                            suggestion="Apply the suggested refactoring to adhere to PEP-8 standards.",
                            line_number=None
                        ))
                except Exception as e:
                    print(f"Autopep8 error: {e}")

            # ============================================================
            # JAVASCRIPT / TYPESCRIPT ANALYSIS
            # ============================================================
            elif language in ["javascript", "typescript"]:
                js_patterns = [
                    (r'eval\s*\(', "Dangerous eval() usage", "Avoid eval() as it can execute arbitrary code (XSS risk)."),
                    (r'innerHTML\s*=', "Potential XSS vulnerability", "Use textContent instead of innerHTML to prevent XSS."),
                    (r'document\.write\s*\(', "document.write() usage", "Avoid document.write() as it can lead to XSS vulnerabilities."),
                    (r'dangerouslySetInnerHTML', "React XSS risk", "dangerouslySetInnerHTML can lead to XSS. Sanitize input first."),
                    (r'new\s+Function\s*\(', "Dynamic function creation", "Avoid creating functions from strings (code injection risk)."),
                    (r'localStorage\.setItem.*password', "Sensitive data in localStorage", "Never store passwords in localStorage."),
                    (r'console\.log\s*\(', "Console.log in code", "Remove console.log statements before production."),
                ]
                
                for pattern, message, suggestion in js_patterns:
                    for match in re.finditer(pattern, request.code, re.IGNORECASE):
                        line_num = request.code[:match.start()].count('\n') + 1
                        suggestions.append(CodeSuggestion(
                            severity="warning",
                            message=f"🔒 {message}",
                            suggestion=suggestion,
                            line_number=line_num
                        ))
                
                complexity_score = min(10, max(1, 
                    request.code.count('function') + 
                    request.code.count('=>') + 
                    request.code.count('if') +
                    request.code.count('for') +
                    request.code.count('while')
                ))
                
                if suggestions:
                    summary_parts.append(f"Found {len(suggestions)} potential issues in {language.title()} code.")
                else:
                    summary_parts.append(f"{language.title()} code looks clean.")

            # ============================================================
            # OTHER LANGUAGES
            # ============================================================
            else:
                generic_patterns = [
                    (r'password\s*=\s*["\'][^"\']+["\']', "Hardcoded password detected", "Never hardcode passwords. Use environment variables."),
                    (r'api[_-]?key\s*=\s*["\'][^"\']+["\']', "Hardcoded API key", "Store API keys in environment variables."),
                    (r'secret\s*=\s*["\'][^"\']+["\']', "Hardcoded secret", "Move secrets to secure configuration."),
                    (r'TODO|FIXME|HACK|XXX', "Code marker found", "Address TODO/FIXME comments before production."),
                ]
                
                for pattern, message, suggestion in generic_patterns:
                    for match in re.finditer(pattern, request.code, re.IGNORECASE):
                        line_num = request.code[:match.start()].count('\n') + 1
                        suggestions.append(CodeSuggestion(
                            severity="warning",
                            message=message,
                            suggestion=suggestion,
                            line_number=line_num
                        ))
                
                complexity_score = min(10, max(1, len(request.code.split('\n')) // 20))
                summary_parts.append(f"Basic analysis completed for {language}.")

            # Final summary
            if not suggestions:
                summary_parts.append("Code looks clean and follows best practices. ✨")
            
            final_summary = " ".join(summary_parts) if summary_parts else "Analysis complete."

            return AnalyzeResponse(
                summary=final_summary,
                complexity_score=complexity_score,
                suggestions=suggestions,
                refactored_code=refactored_code 
            )

        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
    
    @staticmethod
    def _get_vuln_category(test_id: str) -> str:
        """Map Bandit test IDs to human-readable vulnerability categories."""
        categories = {
            'B101': 'Assert Statement',
            'B102': 'exec() Usage',
            'B103': 'Set Bad File Permissions',
            'B104': 'Hardcoded Bind Address',
            'B105': 'Hardcoded Password',
            'B106': 'Hardcoded Password in Function',
            'B107': 'Hardcoded Password Default',
            'B108': 'Hardcoded Temp File',
            'B110': 'Try-Except-Pass',
            'B112': 'Try-Except-Continue',
            'B201': 'Flask Debug Mode',
            'B301': 'Pickle Usage',
            'B302': 'Marshal Usage',
            'B303': 'MD5/SHA1 Insecure Hash',
            'B304': 'DES/3DES Insecure Cipher',
            'B305': 'Cipher Mode Without Auth',
            'B306': 'mktemp Usage',
            'B307': 'eval() Usage',
            'B308': 'mark_safe() XSS',
            'B310': 'urllib.request Audit',
            'B311': 'Random for Crypto',
            'B312': 'Telnet Usage',
            'B313': 'XML Parse Vulnerable',
            'B314': 'XML DOM Parse',
            'B315': 'XML SAX Parse',
            'B316': 'XML expat Parse',
            'B317': 'XML sax Parse Entity',
            'B318': 'XML minidom Parse',
            'B319': 'XML pulldom Parse',
            'B320': 'XML etree Parse',
            'B321': 'FTP Usage',
            'B322': 'input() in Python 2',
            'B323': 'SSL No Verify',
            'B324': 'Insecure Hash',
            'B401': 'Telnetlib Import',
            'B402': 'FTPlib Import',
            'B403': 'Pickle Import',
            'B404': 'Subprocess Import',
            'B405': 'XML etree Import',
            'B406': 'XML SAX Import',
            'B407': 'XML expat Import',
            'B408': 'XML DOM Import',
            'B409': 'XML pulldom Import',
            'B410': 'LXML Import',
            'B411': 'XMLrpc Import',
            'B412': 'HTTPoxy Import',
            'B413': 'PyCrypto Import',
            'B501': 'Request No Verify',
            'B502': 'SSL Weak Version',
            'B503': 'SSL Weak Ciphers',
            'B504': 'SSL No Verify',
            'B505': 'Weak Crypto Key',
            'B506': 'YAML Load',
            'B507': 'SSH No Key Verify',
            'B601': 'Paramiko Call',
            'B602': 'Subprocess Shell',
            'B603': 'Subprocess Without Shell',
            'B604': 'Function Call Shell',
            'B605': 'Start Process Shell',
            'B606': 'Start Process No Shell',
            'B607': 'Start Process Partial Path',
            'B608': 'SQL Hardcoded',
            'B609': 'Linux Commands Wildcard',
            'B610': 'Django SQL Injection',
            'B611': 'Django RawSQL',
            'B701': 'Jinja2 No Autoescape',
            'B702': 'Mako Templates',
            'B703': 'Django mark_safe',
        }
        return categories.get(test_id, f"Security Issue ({test_id})")
