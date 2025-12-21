#!/usr/bin/env node

/**
 * Script to output the current configuration according to the config service
 * This script reads and displays the merged configuration from both app and project levels
 */

import { config } from '../source/config.ts';

async function main() {
  try {
    const currentConfig = await config.getConfig();
    
    console.info('Current Configuration:');
    console.info('====================');
    console.info(JSON.stringify(currentConfig, null, 2));
    
    // Also show the paths where configs are stored
    console.info('\nConfiguration Paths:');
    console.info('====================');
    console.info('App Config Directory:', config.app.getPath());
    console.info('Project Config Directory:', config.project.getPath());
    console.info('Accessible Log Directory:', config.getAccessibleLogDir());
    
    process.exit(0);
  } catch (error) {
    console.error('Error reading configuration:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };