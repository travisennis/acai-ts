# acai-ts

An AI-powered coding assistant that helps developers write better software.

## Description

acai-ts is a command-line tool that leverages AI to assist software developers with various tasks including code review, documentation, problem-solving, code generation, and optimization. It integrates with multiple AI providers and offers a rich set of features to enhance the development workflow.

## Key Features

- Multi-provider AI support (OpenAI, Anthropic, Azure)
- Interactive chat interface
- Code analysis and generation
- File management and editing
- Git integration
- Code formatting and linting
- PDF and URL content processing
- Conventional commit message generation

## Installation

```bash
npm install acai-ts
```

## Usage

```bash
acai chat --provider anthropic
```

Available commands:
- `/add` - Add files to the chat context
- `/tree` - Display project directory structure
- `/url` - Retrieve content from a URL
- `/prompt` - Open editor for complex prompts
- `/mode` - Switch between exploring and editing modes
- `/help` - Show all available commands

## Configuration

Create a `.acai/acai.json` file in your project root to configure:
- Build commands
- Linting preferences
- Formatting options

## Development Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Build the project:
```bash
npm run build
```
## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes using conventional commits
4. Submit a pull request

Please ensure your code follows the project's style guide and includes appropriate tests.

## License

MIT License - see the [LICENSE](LICENSE) file for details.
