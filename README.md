# @travisennis/acai

An AI-powered coding assistant that helps developers write better software.

## Description

acai-ts is a command-line tool that leverages AI to assist software developers with various tasks including code review, documentation, problem-solving, code generation, and optimization. It integrates with multiple AI providers and offers a rich set of features to enhance the development workflow.

## Key Features

- Multi-provider AI support:
  - OpenAI
  - Anthropic
  - Azure OpenAI
  - Google (PaLM)
  - DeepSeek
- Interactive chat interface with context awareness
- Code analysis and generation
- File management and editing
- Git integration with Conventional Commits support
- Code formatting and linting
- Logging and state management
- Code interpreter for JavaScript/TypeScript

## Installation

```bash
npm install @travisennis/acai
```

## Usage

```bash
acai --model anthropic:sonnet -p "Update the readme"
```

## Configuration

Create a `.acai/acai.json` file in your project root:

```json
{
  "build": "npm run build",
  "lint": "npm run lint",
  "format": "npm run format"
}
```

### Environment Variables

Required environment variables based on chosen provider:
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- Azure: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`
- Google: `GOOGLE_API_KEY`
- DeepSeek: `DEEPSEEK_API_KEY`

## Development Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys
```
4. Build the project:
```bash
npm run build
```

### Development Scripts

- `npm run dev` - Run in development mode
- `npm run lint` - Run Biome linter
- `npm run format` - Format code with Biome
- `npm run test` - Run tests
- `npm run check` - Check for dependency updates

## Troubleshooting

### Common Issues

1. **API Key Issues**
   - Ensure required environment variables are set for your chosen provider
   - Check API key permissions and quotas

2. **File Access**
   - The tool can only access files within the current project directory
   - Some operations require write permissions

3. **Memory Usage**
   - Large files or long chat sessions may require increased memory limits

### Logs

Application logs are stored in the system's XDG state directory:
- Linux: `~/.local/state/acai/`
- macOS: `~/Library/Application Support/acai/`
- Windows: `%LOCALAPPDATA%/acai/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Install development dependencies
4. Make your changes following the project's coding standards
5. Run tests and linting
6. Commit changes using [Conventional Commits](https://www.conventionalcommits.org/)
7. Submit a pull request

## License

MIT License - see the [LICENSE](LICENSE) file for details.
