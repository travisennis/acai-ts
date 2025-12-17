#!/usr/bin/env node

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Default provider file path
const DEFAULT_PROVIDER_FILE = './source/models/openrouter-provider.ts';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    modelId: null,
    search: null,
    dryRun: false,
    file: DEFAULT_PROVIDER_FILE,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--search' || arg === '-s') {
      options.search = args[++i];
    } else if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg === '--file' || arg === '-f') {
      options.file = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.modelId = arg;
    }
  }

  return options;
}

// Fetch models from OpenRouter API
async function fetchOpenRouterModels() {
  try {
    console.info('Fetching models from OpenRouter API...');
    const response = await fetch('https://openrouter.ai/api/v1/models');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format: expected data array');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error fetching models:', error.message);
    process.exit(1);
  }
}

// Find model by ID or search
async function findModel(models, options) {
  if (options.modelId) {
    const model = models.find(m => m.id === options.modelId);
    if (!model) {
      console.error(`Model "${options.modelId}" not found.`);
      console.info('Available models:');
      models.slice(0, 10).forEach(m => {
        console.info(`  - ${m.id}`);
      });
      if (models.length > 10) {
        console.info(`  ... and ${models.length - 10} more`);
      }
      process.exit(1);
    }
    return model;
  }

  if (options.search) {
    const matches = models.filter(m => 
      m.id.toLowerCase().includes(options.search.toLowerCase()) ||
      m.name?.toLowerCase().includes(options.search.toLowerCase())
    );
    
    if (matches.length === 0) {
      console.error(`No models found matching "${options.search}"`);
      process.exit(1);
    }
    
    console.info(`Found ${matches.length} matching models:`);
    matches.forEach((m, i) => {
      console.info(`  ${i + 1}. ${m.id} - ${m.name || 'Unnamed'}`);
    });
    
    // For now, just return the first match
    // In a more advanced version, could prompt user to select
    console.info(`\nUsing first match: ${matches[0].id}`);
    return matches[0];
  }

  console.error('Please provide a model ID or use --search');
  process.exit(1);
}

// Extract model key from ID (e.g., "google/gemini-3-flash-preview" -> "gemini-3-flash-preview")
function extractModelKey(modelId) {
  const parts = modelId.split('/');
  return parts[parts.length - 1].replace(/[^a-z0-9-]/gi, '-');
}

// Infer prompt format from model ID
function inferPromptFormat(modelId) {
  if (modelId.includes('gemini')) return 'markdown';
  if (modelId.includes('gpt') || modelId.includes('openai')) return 'xml';
  if (modelId.includes('claude')) return 'markdown';
  if (modelId.includes('qwen')) return 'markdown';
  if (modelId.includes('deepseek')) return 'bracket';
  return 'markdown'; // default
}

// Infer default temperature from model ID
function inferDefaultTemperature(modelId) {
  if (modelId.includes('codex') || modelId.includes('coder')) return -1;
  return 0.5;
}

// Check if model supports reasoning
function supportsReasoning(model) {
  return model.supported_parameters?.includes('include_reasoning') || 
         model.supported_parameters?.includes('reasoning') ||
         false;
}

// Check if model supports tool calling
function supportsToolCalling(model) {
  return model.supported_parameters?.includes('tools') || false;
}

// Generate model registry entry
function generateRegistryEntry(model, modelKey) {
  const contextWindow = model.context_length || 0;
  const maxOutputTokens = model.top_provider?.max_completion_tokens || contextWindow;
  const promptCost = parseFloat(model.pricing?.prompt || '0');
  const completionCost = parseFloat(model.pricing?.completion || '0');
  
  return {
    id: `openrouter:${modelKey}`,
    provider: 'openrouter',
    contextWindow,
    maxOutputTokens,
    defaultTemperature: inferDefaultTemperature(model.id),
    promptFormat: inferPromptFormat(model.id),
    supportsReasoning: supportsReasoning(model),
    supportsToolCalling: supportsToolCalling(model),
    costPerInputToken: promptCost,
    costPerOutputToken: completionCost,
  };
}

// Read and parse existing provider file
async function readProviderFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Error reading provider file ${filePath}:`, error.message);
    process.exit(1);
  }
}

// Find insertion points in the file
function findInsertionPoints(content, modelKey) {
  const lines = content.split('\n');
  
  // Find where openrouterModels object ends
  let modelsEndIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '} as const;') {
      modelsEndIndex = i;
      break;
    }
  }
  
  if (modelsEndIndex === -1) {
    throw new Error('Could not find openrouterModels object end');
  }
  
  // Find where to insert in alphabetical order
  let insertIndex = modelsEndIndex;
  const searchKey = `"${modelKey}"`;
  for (let i = 0; i < modelsEndIndex; i++) {
    const line = lines[i];
    if (line.includes('": openRouterClient("')) {
      const lineKey = line.split('"')[1];
      if (lineKey.localeCompare(modelKey) > 0) {
        insertIndex = i;
        break;
      }
    }
  }
  
  // Find where openrouterModelRegistry object ends
  let registryEndIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '};') {
      registryEndIndex = i;
      break;
    }
  }
  
  if (registryEndIndex === -1) {
    throw new Error('Could not find openrouterModelRegistry object end');
  }
  
  // Find where to insert registry entry in alphabetical order
  let registryInsertIndex = registryEndIndex;
  const registrySearchKey = `"openrouter:${modelKey}"`;
  for (let i = 0; i < registryEndIndex; i++) {
    const line = lines[i];
    if (line.includes('"openrouter:')) {
      const lineKey = line.split('"')[1];
      if (lineKey.localeCompare(`openrouter:${modelKey}`) > 0) {
        registryInsertIndex = i;
        break;
      }
    }
  }
  
  return {
    modelsInsertIndex: insertIndex,
    registryInsertIndex,
    lines,
  };
}

// Insert model into file content
function insertModel(content, model, modelKey, insertionPoints) {
  const { lines, modelsInsertIndex, registryInsertIndex } = insertionPoints;
  const registryEntry = generateRegistryEntry(model, modelKey);
  
  // Create model client line
  const indent = '  ';
  const modelClientLine = `${indent}"${modelKey}": openRouterClient("${model.id}", {`;
  const modelClientLines = [
    modelClientLine,
    `${indent}  usage: { include: true },`,
    `${indent}}) as LanguageModelV2,`,
  ];
  
  // Create registry entry lines
  const registryLines = [
    `${indent}"openrouter:${modelKey}": {`,
    `${indent}  id: "openrouter:${modelKey}",`,
    `${indent}  provider: "openrouter",`,
    `${indent}  contextWindow: ${registryEntry.contextWindow},`,
    `${indent}  maxOutputTokens: ${registryEntry.maxOutputTokens},`,
    `${indent}  defaultTemperature: ${registryEntry.defaultTemperature},`,
    `${indent}  promptFormat: "${registryEntry.promptFormat}",`,
    `${indent}  supportsReasoning: ${registryEntry.supportsReasoning},`,
    `${indent}  supportsToolCalling: ${registryEntry.supportsToolCalling},`,
    `${indent}  costPerInputToken: ${registryEntry.costPerInputToken},`,
    `${indent}  costPerOutputToken: ${registryEntry.costPerOutputToken},`,
    `${indent}},`,
  ];
  
  // Insert model client
  lines.splice(modelsInsertIndex, 0, ...modelClientLines);
  
  // Update registry insert index (shifted by model client insertion)
  const updatedRegistryIndex = registryInsertIndex + modelClientLines.length;
  lines.splice(updatedRegistryIndex, 0, ...registryLines);
  
  return lines.join('\n');
}

// Run project validation
async function runValidation() {
  try {
    console.info('\nRunning project validation...');
    
    // Type check
    console.info('Running type check...');
    await execAsync('npm run typecheck');
    
    // Lint
    console.info('Running lint...');
    await execAsync('npm run lint');
    
    // Format
    console.info('Running format...');
    await execAsync('npm run format');
    
    console.info('✅ All validation passed!');
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    if (error.stderr) {
      console.error(error.stderr);
    }
    throw error;
  }
}

// Show help
function showHelp() {
  console.info(`
Add OpenRouter Model - Skill for acai-ts project

Usage:
  node add-model.js <model-id> [options]
  node add-model.js --search <query> [options]

Options:
  <model-id>           OpenRouter model ID (e.g., google/gemini-3-flash-preview)
  --search, -s <query> Search for models containing query
  --dry-run, -d        Show what would be added without modifying files
  --file, -f <path>    Custom provider file path (default: ./source/models/openrouter-provider.ts)
  --help, -h           Show this help message

Examples:
  node add-model.js google/gemini-3-flash-preview
  node add-model.js --search "gemini"
  node add-model.js anthropic/claude-3-5-sonnet --dry-run
  `);
}

// Main function
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  // Check if provider file exists
  if (!existsSync(options.file)) {
    console.error(`Provider file not found: ${options.file}`);
    process.exit(1);
  }
  
  // Fetch models
  const models = await fetchOpenRouterModels();
  
  // Find target model
  const model = await findModel(models, options);
  const modelKey = extractModelKey(model.id);
  
  console.info(`\n📋 Model: ${model.id}`);
  console.info(`   Name: ${model.name || 'Unnamed'}`);
  console.info(`   Key: ${modelKey}`);
  
  // Generate registry entry for display
  const registryEntry = generateRegistryEntry(model, modelKey);
  console.info('\n📝 Registry entry:');
  console.info(JSON.stringify(registryEntry, null, 2));
  
  if (options.dryRun) {
    console.info('\n✅ Dry run complete - no files modified');
    return;
  }
  
  // Read existing file
  console.info(`\n📖 Reading provider file: ${options.file}`);
  const content = await readProviderFile(options.file);
  
  // Check for duplicates
  if (content.includes(`"${modelKey}": openRouterClient(`)) {
    console.error(`❌ Model "${modelKey}" already exists in provider file`);
    process.exit(1);
  }
  
  if (content.includes(`"openrouter:${modelKey}"`)) {
    console.error(`❌ Registry entry for "openrouter:${modelKey}" already exists`);
    process.exit(1);
  }
  
  // Find insertion points
  const insertionPoints = findInsertionPoints(content, modelKey);
  
  // Create backup
  const backupFile = `${options.file}.backup`;
  await copyFile(options.file, backupFile);
  console.info(`💾 Created backup: ${backupFile}`);
  
  // Insert model
  const newContent = insertModel(content, model, modelKey, insertionPoints);
  
  // Write updated file
  await writeFile(options.file, newContent, 'utf-8');
  console.info(`✏️  Updated provider file: ${options.file}`);
  
  // Run validation
  try {
    await runValidation();
    console.info(`\n🎉 Successfully added model "${model.id}" to ${options.file}`);
    console.info(`   Model key: ${modelKey}`);
    console.info(`   Full ID: openrouter:${modelKey}`);
  } catch (error) {
    console.error('\n❌ Validation failed - restoring backup...');
    await copyFile(backupFile, options.file);
    console.info(`✅ Restored original file from backup`);
    process.exit(1);
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});