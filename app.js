const ApiClient = require('./apiClient');
const UDPBroadcastServer = require('./server');
const readline = require('readline');

// Function to prompt user for force sync
function promptForceSync() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('╔═══════════════════════════════════════════╗');
        console.log('║          Configuration Options            ║');
        console.log('╚═══════════════════════════════════════════╝');
        console.log();
        console.log('Do you want to force sync configuration from Cloud API?');
        console.log('  • Press "y" or "Y" for YES (force sync from cloud)');
        console.log('  • Press "n" or "N" for NO (use cached/default config)');
        console.log('  • No input will auto-decide based on config completeness');
        console.log();
        
        let timeoutId;
        let answered = false;

        const handleAnswer = (answer) => {
            if (answered) return;
            answered = true;
            
            clearTimeout(timeoutId);
            rl.close();
            
            const input = answer.toLowerCase().trim();
            if (input === 'y' || input === 'yes') {
                console.log('✅ User selected: Force sync from Cloud API\n');
                resolve(true);
            } else if (input === 'n' || input === 'no') {
                console.log('✅ User selected: Use cached/default configuration\n');
                resolve(false);
            } else {
                console.log('❓ Invalid input, auto-deciding based on config completeness\n');
                resolve(null); // null means auto-decide
            }
        };

        // Set up the prompt
        rl.question('Your choice (y/n): ', handleAnswer);

        // Set up timeout
        timeoutId = setTimeout(() => {
            if (answered) return;
            answered = true;
            
            rl.close();
            console.log('⏱️  Timeout reached (15 seconds), auto-deciding based on config completeness\n');
            resolve(null); // null means auto-decide
        }, 15000);

        // Show countdown
        let countdown = 15;
        const countdownInterval = setInterval(() => {
            if (answered) {
                clearInterval(countdownInterval);
                return;
            }
            countdown--;
            if (countdown > 0) {
                process.stdout.write(`\rTimeout in ${countdown} seconds... `);
            }
        }, 1000);

        // Clean up countdown on answer
        const originalHandleAnswer = handleAnswer;
        const wrappedHandleAnswer = (answer) => {
            clearInterval(countdownInterval);
            process.stdout.write('\r' + ' '.repeat(30) + '\r'); // Clear countdown line
            originalHandleAnswer(answer);
        };
        
        rl.removeAllListeners('line');
        rl.question('Your choice (y/n): ', wrappedHandleAnswer);
    });
}

// Function to check if config has all required parameters
function isConfigComplete(apiClient) {
    const baseConfig = apiClient.getBaseConfig();
    const requiredFields = ['propertyId', 'app_id', 'app_secret', 'cmsServer'];
    const missingFields = requiredFields.filter(field => !baseConfig[field] || baseConfig[field].toString().trim() === '');
    
    if (missingFields.length > 0) {
        console.log('❌ Base configuration incomplete. Missing required fields:');
        missingFields.forEach(field => {
            console.log(`   • ${field}`);
        });
        return false;
    }
    
    // Check if cached dynamic config exists
    const hasCached = apiClient.hasCachedConfig();
    
    if (hasCached) {
        console.log('✅ Configuration appears complete with cached dynamic parameters');
        return true;
    } else {
        console.log('⚠️  Base configuration complete but no cached dynamic parameters found');
        return false;
    }
}

// Main execution
async function main() {
    console.clear();
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║     UDP Broadcast Server v2.0             ║');
    console.log('║     With Secure Authentication            ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    
    try {
        // Initialize API client (loads hardcoded config)
        console.log('🔄 Loading base configuration...');
        const apiClient = new ApiClient();
        
        // Check configuration completeness
        const configComplete = isConfigComplete(apiClient);
        
        // Prompt user for force sync decision
        const userChoice = await promptForceSync();
        
        let shouldForceSync = false;
        
        if (userChoice === true) {
            // User explicitly chose to force sync
            shouldForceSync = true;
        } else if (userChoice === false) {
            // User explicitly chose NOT to force sync
            shouldForceSync = false;
        } else {
            // Auto-decide based on config completeness
            shouldForceSync = !configComplete;
            if (shouldForceSync) {
                console.log('🔄 Auto-decision: Force sync required due to incomplete configuration');
            } else {
                console.log('✅ Auto-decision: Configuration complete, proceeding without force sync');
            }
        }
        
        let config;
        
        if (shouldForceSync) {
            console.log('🌐 Performing force sync from Cloud API...');
            config = await apiClient.initialize(true); // Force sync
        } else {
            console.log('⚡ Using cached/default configuration...');
            config = await apiClient.initialize(false); // Try cached first
        }
        
        console.log('✅ Configuration loaded successfully');
        
        // Parse broadcast IPs into array
        const broadcastIPs = config.broadcastIP.split(',').map(ip => ip.trim());
        
        // Create final configuration object with proper naming
        const finalConfig = {
            propertyId: config.propertyId,
            app_id: config.app_id,
            app_secret: config.app_secret,
            cmsServer: config.cmsServer,
            onPremiseServerIP: config.onPremiseServer, // Use as-is from API response
            broadcastIPs: broadcastIPs,
            broadcastPort: config.broadcastPort,
            broadcastInterval: config.broadcastInterval
        };
        
        // Display final configuration
        console.log('\n═══════════════════════════════════════════');
        console.log('  Final Configuration');
        console.log('═══════════════════════════════════════════');
        console.log(`  Property ID: ${finalConfig.propertyId}`);
        console.log(`  App ID: ${finalConfig.app_id}`);
        console.log(`  CMS Server: ${finalConfig.cmsServer}`);
        console.log(`  On-Premise Server: ${finalConfig.onPremiseServerIP}`);
        console.log(`  Broadcast IPs (${finalConfig.broadcastIPs.length}):`);
        finalConfig.broadcastIPs.forEach((ip, index) => {
            console.log(`    ${index + 1}. ${ip}`);
        });
        console.log(`  Broadcast Port: ${finalConfig.broadcastPort}`);
        console.log(`  Broadcast Interval: ${finalConfig.broadcastInterval}ms`);
        console.log(`  Authentication: ✓ Secured with access tokens`);
        console.log(`  Config Source: ${shouldForceSync ? '🌐 Cloud API (Force Sync)' : '⚡ Cached/Default'}`);
        console.log('═══════════════════════════════════════════');
        
        // Start server with configuration
        console.log('\n🚀 Starting UDP Broadcast Server...');
        const server = new UDPBroadcastServer(finalConfig);
        server.start();
        
        // Graceful shutdown handlers
        process.on('SIGINT', () => {
            console.log('\n\n─────────────────────────────────────────────');
            console.log('Shutting down server...');
            server.stop();
            setTimeout(() => process.exit(0), 100);
        });
        
        process.on('SIGTERM', () => {
            server.stop();
            process.exit(0);
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (err) => {
            console.error('\n✗ Uncaught exception:', err);
            server.stop();
            process.exit(1);
        });
        
    } catch (error) {
        console.error('❌ Fatal error during initialization:', error.message);
        console.error('   Please check your configuration and network connectivity.');
        process.exit(1);
    }
}

// Start the application
main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});